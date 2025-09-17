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

// First, let's add default RSI configs as constants
const DEFAULT_RSI_CONFIG = {
  period: 7,
  entry: 85,
  exit: 25,
};

// Add symbol-specific RSI configurations
const SYMBOL_RSI_CONFIGS = {
  trxusdt: { entry: 65, exit: 20 },
  bnbusdt: { entry: 65, exit: 20 },
  // Add other symbol-specific configs as needed
};

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
  constructor({ symbol, interval, buyLimit, rsiConfig }) {
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

    // Set symbol-specific RSI config or use defaults
    this.rsiConfig = {
      period: DEFAULT_RSI_CONFIG.period,
      entry:
        rsiConfig?.entry ||
        SYMBOL_RSI_CONFIGS[this.symbol]?.entry ||
        DEFAULT_RSI_CONFIG.entry,
      exit:
        rsiConfig?.exit ||
        SYMBOL_RSI_CONFIGS[this.symbol]?.exit ||
        DEFAULT_RSI_CONFIG.exit,
    };
  }

  async seedHistoricalCloses() {
    try {
      const limit = this.rsiConfig.period + 10;
      const url =
        `https://api.binance.com/api/v3/klines` +
        `?symbol=${this.symbol.toUpperCase()}` +
        `&interval=${this.interval}` +
        `&limit=${limit}`;
      const resp = await axios.get(url);
      const historicalCloses = resp.data.map((k) => parseFloat(k[4]));

      const rsiArray = RSI.calculate({
        values: historicalCloses,
        period: this.rsiConfig.period,
      });

      this.rsi = new RSI({ period: this.rsiConfig.period, values: [] });

      historicalCloses.forEach((close) => this.rsi.nextValue(close));

      this.prevRsi = rsiArray[rsiArray.length - 1];

      console.log(
        `[${this.symbol}] Seeded closes=${historicalCloses.length
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
      quantity =
        this.symbol === "wlfiusdt" ? quantity.toFixed(4) : quantity.toFixed(8);

      console.log(
        `[${this.symbol}] Calculated buy quantity (rounded): ${quantity}`
      );

      const order = await binance.marketBuy(
        this.symbol.toUpperCase(),
        parseFloat(quantity)
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
      throw err;
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
      throw err;
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
            this.prevRsi <= this.rsiConfig.entry &&
            currRsi > this.rsiConfig.entry
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
            this.prevRsi >= this.rsiConfig.exit &&
            currRsi < this.rsiConfig.exit
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
      if (this.ws) {
        // Remove all event listeners to prevent any lingering callbacks
        this.ws.removeAllListeners();
        // Forcefully terminate the connection
        this.ws.terminate();
        this.ws = null;
      }

      // Reset internal state
      this.closes = [];
      this.rsi = null;
      this.prevRsi = null;
      this.reconnectAttempts = 0;

      console.log(`[${this.symbol}] Stopped and cleaned up resources`);
      return true;
    } catch (err) {
      console.error(`[${this.symbol}] Error in stop:`, err.message);
      return false;
    }
  }
}

// FIX: Prevent duplicate long positions
const createNewSymbolBot = async (
  res,
  { symbol: key, interval, inLong, buyLimit, rsiConfig }
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
    rsiConfig,
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
  SYMBOL_RSI_CONFIGS
);
app.use("/", routes);

const defaultBot = [
  "ethusdt",
  "bnbusdt",
  "solusdt",
  "avaxusdt",
  "linkusdt",
  "trxusdt",
];

// Start server
app.listen(PORT, async () => {
  console.log(`API server listening on port ${PORT}`);
  try {
    fork("./symbolsWorker.js");
    await getAvailableBalance();

    // Create bots for all assets except USDT with available balance > 0
    for (const index in defaultBot) {
      const asset = defaultBot[index].replace("usdt", "").toUpperCase();
      if (asset === "USDT") continue;
      const balance = parseFloat(availableBalance[asset]?.available || "0");
      console.log(
        `Creating bot for ${asset} with available balance: ${balance}`
      );
      const symbol = `${asset.toLowerCase()}usdt`;
      try {
        await createNewSymbolBot(undefined, {
          symbol,
          interval: "5m",
          inLong: balance > 0.1,
          buyLimit: 15,
          rsiConfig: SYMBOL_RSI_CONFIGS[symbol], // Pass symbol-specific config if it exists
        });
      } catch (botErr) {
        console.error(
          `[${symbol}] Error creating bot:`,
          botErr.message || botErr
        );
      }
    }
    // Start worker on server start
  } catch (err) {
    console.error("Error during server startup:", err.message || err);
  }
});
