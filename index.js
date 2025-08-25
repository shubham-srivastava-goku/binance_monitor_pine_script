// File: server.js

const express = require("express");
const axios = require("axios");
const WebSocket = require("ws");
const { RSI, getRSI } = require("technicalindicators");
const { fork } = require("child_process");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = "https://wtalerts.com/bot/custom";

const RSI_PERIOD = 7;
const RSI_ENTRY = 65;
const RSI_EXIT = 20;

// In‐memory registry of active symbol bots
const bots = new Map();

class SymbolBot {
  constructor({ symbol, interval, entryMessage, exitMessage }) {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
    this.entryMessage = entryMessage;
    this.exitMessage = exitMessage;
    this.closes = [];
    this.rsi = null; // Store the RSI instance
    this.prevRsi = null;
    this.inLong = false;
    this.ws = null;
  }

  async seedHistoricalCloses() {
    try {
      const limit = RSI_PERIOD + 10; // Get more data than the minimum to be safe
      const url =
        `https://api.binance.com/api/v3/klines` +
        `?symbol=${this.symbol.toUpperCase()}` +
        `&interval=${this.interval}` +
        `&limit=${limit}`;
      const resp = await axios.get(url);
      const historicalCloses = resp.data.map((k) => parseFloat(k[4]));

      // Use RSI.calculate on the full history to get all historical RSI values
      const rsiArray = RSI.calculate({
        values: historicalCloses,
        period: RSI_PERIOD,
      });

      // Initialize the streaming RSI with an empty array
      this.rsi = new RSI({ period: RSI_PERIOD, values: [] });

      // Seed the streaming RSI instance with the data
      historicalCloses.forEach((close) => this.rsi.nextValue(close));

      this.prevRsi = rsiArray[rsiArray.length - 1];

      console.log(
        `[${this.symbol}] Seeded closes=${
          historicalCloses.length
        }, initial RSI=${this.prevRsi.toFixed(2)}`
      );
    } catch (err) {
      console.error(
        `[${this.symbol}] Error seeding historical closes:`,
        err.message
      );
      throw err;
    }
  }

  async sendWebhook(payload) {
    try {
      const response = await axios.post(WEBHOOK_URL, payload.comment, {
        headers: {
          "Content-Type": "text/plain",
        },
      });

      console.log("Webhook sent successfully! ", payload);
      console.log("Status Code:", response.status);
      console.log("Response Body:", response.data);
    } catch (err) {
      console.error(`[${this.symbol}] Webhook error:`, err.message);
    }
  }

  startStream() {
    const streamUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@kline_${this.interval}`;
    this.ws = new WebSocket(streamUrl);

    this.ws.on("open", () => {
      console.log(`[${this.symbol}] WebSocket open`);
    });

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.e !== "kline" || !msg.k.x) return;
      const time = msg.k.t;
      const close = parseFloat(msg.k.c);

      const currRsi = this.rsi.nextValue(close);

      // We need at least two RSI values to check for a crossover
      if (this.prevRsi === null || currRsi === undefined) {
        if (currRsi !== undefined) {
          this.prevRsi = currRsi;
        }
        return;
      }

      console.log(
        `[${this.symbol}] close=${close} prevRsi=${this.prevRsi.toFixed(
          2
        )} currRsi=${currRsi.toFixed(2)} inLong=${this.inLong}`
      );

      // 4) entry crossover
      if (!this.inLong && this.prevRsi <= RSI_ENTRY && currRsi > RSI_ENTRY) {
        const payload = {
          symbol: this.symbol.toUpperCase(),
          type: "ENTER-LONG",
          price: close,
          time,
          comment: this.entryMessage,
        };
        this.sendWebhook(payload);
        this.inLong = true;
      }

      // 5) exit crossunder
      if (this.inLong && this.prevRsi >= RSI_EXIT && currRsi < RSI_EXIT) {
        const payload = {
          symbol: this.symbol.toUpperCase(),
          type: "EXIT-LONG",
          price: close,
          time,
          comment: this.exitMessage,
        };
        this.sendWebhook(payload);
        this.inLong = false;
      }

      this.prevRsi = currRsi;
    });

    this.ws.on("error", (err) =>
      console.error(`[${this.symbol}] WS error:`, err.message)
    );
    this.ws.on("close", () => console.log(`[${this.symbol}] WebSocket closed`));
  }

  async start() {
    await this.seedHistoricalCloses();
    this.startStream();
  }

  stop() {
    if (this.ws) this.ws.close();
    console.log(`[${this.symbol}] Stopped`);
  }
}
const createNewSymbolBot = async (
  res,
  { symbol: key, interval, entryMessage, exitMessage, inLong }
) => {
  const bot = new SymbolBot({
    symbol: key,
    interval,
    entryMessage,
    exitMessage,
  });
  if (typeof inLong === "boolean") {
    bot.inLong = inLong;
  }
  bots.set(key, bot);
  try {
    await bot.start();
    res &&
      res
        .status(201)
        .json({ message: "Symbol added", symbol: key, inLong: bot.inLong });
  } catch (e) {
    bots.delete(key);
    res && res.status(500).json({ error: e.message });
  }
};
// POST /symbols – add & start a bot
app.post("/symbols", async (req, res) => {
  const { symbol, interval, entryMessage, exitMessage, inLong } = req.body;
  if (!symbol || !interval || !entryMessage || !exitMessage) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const key = symbol.toLowerCase();
  if (bots.has(key)) {
    return res.status(409).json({ error: "Symbol already exists" });
  }
  await createNewSymbolBot(res, {
    symbol: key,
    interval,
    entryMessage,
    exitMessage,
    inLong, // pass through, may be undefined
  });
});

createNewSymbolBot(undefined, {
  symbol: "ethusdt",
  interval: "5m",
  entryMessage:
    "ENTER-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
  exitMessage:
    "EXIT-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
});

createNewSymbolBot(undefined, {
  symbol: "api3usdt",
  interval: "5m",
  entryMessage:
    "ENTER-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585",
  exitMessage:
    "EXIT-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585",
});

// DELETE /symbols/:symbol – stop & remove a bot
app.delete("/symbols/:symbol", (req, res) => {
  const key = req.params.symbol.toLowerCase();
  const bot = bots.get(key);
  if (!bot) return res.status(404).json({ error: "Symbol not found" });
  bot.stop();
  bots.delete(key);
  res.json({ message: "Symbol removed", symbol: key });
});

// GET /symbols – list active bots
app.get("/symbols", (req, res) => {
  const list = [];
  for (const [key, bot] of bots.entries()) {
    list.push({
      symbol: key,
      interval: bot.interval,
      entryMessage: bot.entryMessage,
      exitMessage: bot.exitMessage,
      inLong: bot.inLong,
    });
  }
  res.json(list);
});

// PATCH /symbols/:symbol/status – update inLong status
app.patch("/symbols/:symbol/status", (req, res) => {
  const key = req.params.symbol.toLowerCase();
  const bot = bots.get(key);
  if (!bot) return res.status(404).json({ error: "Symbol not found" });

  const { inLong } = req.body;
  if (typeof inLong !== "boolean")
    return res.status(400).json({ error: "inLong must be boolean" });

  bot.inLong = inLong;
  res.json({ message: "Status updated", symbol: key, inLong: bot.inLong });
});

// Start server
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
  // Start worker on server start
  fork("./symbolsWorker.js");
});
