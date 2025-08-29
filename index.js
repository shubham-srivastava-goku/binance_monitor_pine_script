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

let availableBalance = {};

const getAvailableBalance = async () => {
  try {
    const balance = await binance.balance();
    availableBalance = { ...balance };
    return balance;
  } catch (err) {
    console.error("Error fetching balance:", err.message);
  }
};

class SymbolBot {
  constructor({ symbol, interval, buyLimit }) {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
    this.closes = [];
    this.rsi = null;
    this.prevRsi = null;
    this.inLong = false;
    this.ws = null;
    this.symbolQuantity =
      availableBalance[symbol.replace("usdt", "").toUpperCase()]?.available ||
      0;
    this.usdtQuantity = availableBalance["USDT"]?.available || 0;
    this.reconnectAttempts = 0;
    this.buyLimit = typeof buyLimit === "number" ? buyLimit : Infinity;
  }

  async seedHistoricalCloses() {
    try {
      const limit = rsiConfig.period + 10;
      const url =
        `https://api.binance.com/api/v3/klines` +
        `?symbol=${this.symbol.toUpperCase()}` +
        `&interval=${this.interval}` +
        `&limit=${limit}`;
      const resp = await axios.get(url);
      const historicalCloses = resp.data.map((k) => parseFloat(k[4]));

      const rsiArray = RSI.calculate({
        values: historicalCloses,
        period: rsiConfig.period,
      });

      this.rsi = new RSI({ period: rsiConfig.period, values: [] });

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

  async sendBuyOrder(price) {
    try {
      await getAvailableBalance();
      const usdtBalance = availableBalance["USDT"]?.available || 0;
      if (usdtBalance < 5) {
        console.warn(
          `[${this.symbol}] Insufficient USDT balance to place buy order: ${usdtBalance}`
        );
        throw new Error("Insufficient USDT balance");
      }
      const maxUsdtToUse = Math.min(usdtBalance, this.buyLimit);

      console.log(
        `[${this.symbol}] Preparing to buy. USDT balance: ${usdtBalance}, buy limit: ${this.buyLimit}, using: ${maxUsdtToUse}, price: ${price}`
      );

      const info = await binance.exchangeInfo();
      const symbolInfo = info.symbols.find(
        (s) => s.symbol === this.symbol.toUpperCase()
      );
      const stepSize = parseFloat(
        symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE").stepSize
      );
      let quantity = maxUsdtToUse / price;
      quantity = Math.floor(quantity / stepSize) * stepSize;
      quantity = quantity.toFixed(8);

      console.log(
        `[${this.symbol}] Calculated buy quantity (rounded): ${quantity}`
      );

      const order = await binance.marketBuy(
        this.symbol.toUpperCase(),
        quantity
      );
      if (order.status !== "FILLED") {
        console.warn(`[${this.symbol}] Buy order not filled:`, order);
      } else {
        console.log(`[${this.symbol}] Buy order filled:`, order);
      }

      // Update balances after buy
      await getAvailableBalance();
      this.symbolQuantity =
        availableBalance[this.symbol.replace("usdt", "").toUpperCase()]
          ?.available || 0;
      this.usdtQuantity = availableBalance["USDT"]?.available || 0;
      console.log(
        `[${this.symbol}] Updated balances after buy. Symbol quantity: ${this.symbolQuantity}, USDT quantity: ${this.usdtQuantity}`
      );
    } catch (err) {
      console.error(
        `[${this.symbol}] Buy order error:`,
        err.body || err.message
      );
    }
  }

  async sendSellOrder(price) {
    try {
      await getAvailableBalance();
      const assetBalance =
        availableBalance[this.symbol.replace("usdt", "").toUpperCase()]
          ?.available || 0;

      console.log(`[${this.symbol}] Preparing to sell at price: ${price}`);
      console.log(
        `[${this.symbol}] Preparing to sell. Symbol quantity: ${assetBalance}, price: ${price}`
      );

      // Get exchange info for stepSize
      const info = await binance.exchangeInfo();
      const symbolInfo = info.symbols.find(
        (s) => s.symbol === this.symbol.toUpperCase()
      );
      const stepSize = parseFloat(
        symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE").stepSize
      );
      console.log(`[${this.symbol}] Step size for quantity: ${stepSize}`);

      let quantity = assetBalance;
      quantity = Math.floor(quantity / stepSize) * stepSize;
      quantity = quantity.toFixed(8);

      console.log(
        `[${this.symbol}] Calculated sell quantity (rounded): ${quantity}`
      );

      // FIX 5: Check order status
      const order = await binance.marketSell(
        this.symbol.toUpperCase(),
        quantity
      );
      if (order.status !== "FILLED") {
        console.warn(`[${this.symbol}] Sell order not filled:`, order);
      } else {
        console.log(`[${this.symbol}] Sell order filled:`, order);
      }
      await getAvailableBalance();
      this.symbolQuantity =
        availableBalance[this.symbol.replace("usdt", "").toUpperCase()]
          ?.available || 0;
      this.usdtQuantity = availableBalance["USDT"]?.available || 0;
      console.log(
        `[${this.symbol}] Updated balances after sell. Symbol quantity: ${this.symbolQuantity}, USDT quantity: ${this.usdtQuantity}`
      );
    } catch (err) {
      console.error(
        `[${this.symbol}] Sell order error:`,
        err.body || err.message
      );
    }
  }

  startStream() {
    const streamUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@kline_${this.interval}`;
    const connect = () => {
      this.ws = new WebSocket(streamUrl);

      this.ws.on("open", () => {
        this.reconnectAttempts = 0;
        console.log(`[${this.symbol}] WebSocket open`);
      });

      this.ws.on("message", (data) => {
        try {
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
            this.sendBuyOrder(close)
              .then(() => {
                this.inLong = true;
              })
              .catch((err) => {
                console.error(
                  `[${this.symbol}] Buy order failed, not setting inLong:`,
                  err.message || err
                );
              });
          }

          // 5) exit crossunder
          if (
            this.inLong &&
            this.prevRsi >= rsiConfig.exit &&
            currRsi < rsiConfig.exit
          ) {
            this.sendSellOrder(close)
              .then(() => {
                this.inLong = false;
              })
              .catch((err) => {
                console.error(
                  `[${this.symbol}] Sell order failed, not resetting inLong:`,
                  err.message || err
                );
              });
          }

          this.prevRsi = currRsi;
        } catch (err) {
          console.error(
            `[${this.symbol}] Error in message handler:`,
            err.message
          );
        }
      });

      this.ws.on("error", (err) => {
        console.error(`[${this.symbol}] WS error:`, err.message);
        // FIX 4: Attempt reconnect on error
        this.tryReconnect(connect);
      });

      this.ws.on("close", () => {
        console.log(`[${this.symbol}] WebSocket closed`);
        // FIX 4: Attempt reconnect on close
        this.tryReconnect(connect);
      });
    };

    connect();
  }

  tryReconnect(connectFn) {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(
          `[${this.symbol}] Attempting reconnect #${this.reconnectAttempts}`
        );
        connectFn();
      }, 1000 * this.reconnectAttempts);
    } else {
      console.error(`[${this.symbol}] Max reconnect attempts reached.`);
    }
  }

  async start() {
    try {
      await this.seedHistoricalCloses();
      this.startStream();
    } catch (err) {
      console.error(`[${this.symbol}] Error in start:`, err.message);
      throw err;
    }
  }

  stop() {
    try {
      if (this.ws) this.ws.close();
      console.log(`[${this.symbol}] Stopped`);
    } catch (err) {
      console.error(`[${this.symbol}] Error in stop:`, err.message);
    }
  }
}

// FIX: Prevent duplicate long positions
const createNewSymbolBot = async (
  res,
  { symbol: key, interval, inLong, buyLimit }
) => {
  if (bots.has(key)) {
    res &&
      res
        .status(409)
        .json({ error: "Bot for this symbol already exists", symbol: key });
    return;
  }
  const bot = new SymbolBot({
    symbol: key,
    interval,
    buyLimit,
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
  try {
    fork("./symbolsWorker.js");
    await getAvailableBalance();

    // Create bots for all assets except USDT with available balance > 0
    for (const asset in availableBalance) {
      if (asset === "USDT") continue;
      const balance = parseFloat(availableBalance[asset]?.available || "0");
      if (balance > 0) {
        console.log(
          `Creating bot for ${asset} with available balance: ${balance}`
        );
        const symbol = `${asset.toLowerCase()}usdt`;
        try {
          await createNewSymbolBot(undefined, {
            symbol,
            interval: "5m",
            inLong: balance > 0.1,
          });
        } catch (botErr) {
          console.error(
            `[${symbol}] Error creating bot:`,
            botErr.message || botErr
          );
        }
      }
    }

    // Start worker on server start
  } catch (err) {
    console.error("Error during server startup:", err.message || err);
  }
});
