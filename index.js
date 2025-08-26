// File: server.js

const express = require("express");
const axios = require("axios");
const WebSocket = require("ws");
const { RSI } = require("technicalindicators");
const { fork } = require("child_process");
const Binance = require("node-binance-api");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = "https://wtalerts.com/bot/custom";
const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;

const RSI_PERIOD = 7;
const RSI_ENTRY = 85;
const RSI_EXIT = 25;

// In‐memory registry of active symbol bots
const bots = new Map();
const binance = new Binance({
  APIKEY: apiKey,
  APISECRET: apiSecret,
});

let rsiConfig = {
  period: RSI_PERIOD,
  entry: RSI_ENTRY,
  exit: RSI_EXIT,
};

const getAvailavleBalance = async () => {
  try {
    const balance = await binance.balance();
    console.log("Available balance:", balance);
    return balance;
  } catch (err) {
    console.error("Error fetching balance:", err.message);
  }
};

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
      const limit = rsiConfig.period + 10; // Get more data than the minimum to be safe
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
        period: rsiConfig.period,
      });

      // Initialize the streaming RSI with an empty array
      this.rsi = new RSI({ period: rsiConfig.period, values: [] });

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
      if (
        !this.inLong &&
        this.prevRsi <= rsiConfig.entry &&
        currRsi > rsiConfig.entry
      ) {
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
      if (
        this.inLong &&
        this.prevRsi >= rsiConfig.exit &&
        currRsi < rsiConfig.exit
      ) {
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

// Move route logic to routes.js
const routes = require("./routes")(
  bots,
  rsiConfig,
  createNewSymbolBot,
  binance
);
app.use("/", routes);

// Start server
app.listen(PORT, async () => {
  console.log(`API server listening on port ${PORT}`);
  await getAvailavleBalance();

  createNewSymbolBot(undefined, {
    symbol: "ethusdt",
    interval: "5m",
    entryMessage:
      "ENTER-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
    exitMessage:
      "EXIT-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
    inLong: false,
  });

  createNewSymbolBot(undefined, {
    symbol: "api3usdt",
    interval: "5m",
    entryMessage:
      "ENTER-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585",
    exitMessage:
      "EXIT-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585",
    inLong: true,
  });

  // Start worker on server start
  fork("./symbolsWorker.js");
});
