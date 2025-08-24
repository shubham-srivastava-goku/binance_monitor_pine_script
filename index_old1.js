const express = require("express");
const WebSocket = require("ws");
const axios = require("axios");
const ti = require("technicalindicators");
const FormData = require('form-data');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// === Config ===
const INTERVAL = "5m";
const RSI_PERIOD = 7;
const RSI_ENTRY = 65;
const RSI_EXIT = 20;
const WUNDER_WEBHOOK = "https://wtalerts.com/bot/trading_view";

// === State for multiple symbols ===
const websockets = {}; // { symbol: ws }
const symbolStates = {}; // { symbol: { closes: [], inPosition: false, reconnectAttempts: 0, comments: { buy: '', sell: '' } } }
const MAX_RECONNECT_ATTEMPTS = 5;

// === Dynamic WebSocket Handler ===
function connectWebSocket(symbol, comments) {
  const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_${INTERVAL}`;
  console.log(`🔗 Connecting to: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  symbolStates[symbol] = symbolStates[symbol] || {
    closes: [],
    inPosition: false,
    reconnectAttempts: 0,
    comments: comments || { buy: '', sell: '' },
  };

  ws.on("open", () => {
    console.log(`✅ WebSocket connected for ${symbol}`);
    symbolStates[symbol].reconnectAttempts = 0;
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error for ${symbol}:`, error.message);
  });

  ws.on("close", (code, reason) => {
    console.log(`🔌 WebSocket disconnected for ${symbol} - Code: ${code}, Reason: ${reason}`);
    if (symbolStates[symbol].reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      symbolStates[symbol].reconnectAttempts++;
      console.log(
        `🔄 Reconnecting ${symbol}... Attempt ${symbolStates[symbol].reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
      );
      setTimeout(() => connectWebSocket(symbol, symbolStates[symbol].comments), 5000);
    } else {
      console.error(`❌ Max reconnection attempts reached for ${symbol}`);
    }
  });

  ws.on("message", (msg) => handleMessage(msg, symbol));
  websockets[symbol] = ws;
}

// === Common Message Handler ===
async function handleMessage(msg, symbol) {
  const data = JSON.parse(msg);
  if (data.k && data.k.x) {
    const close = parseFloat(data.k.c);
    const state = symbolStates[symbol];
    state.closes.push(close);
    if (state.closes.length > RSI_PERIOD) {
      const rsi = ti.RSI.calculate({ period: RSI_PERIOD, values: state.closes });
      const lastRSI = rsi[rsi.length - 1];
      const prevRSI = rsi[rsi.length - 2];
      console.log(
        `[${symbol}] RSI: ${lastRSI.toFixed(2)} | Position: ${state.inPosition ? "LONG" : "FLAT"}`
      );
      if (!state.inPosition && prevRSI < RSI_ENTRY && lastRSI >= RSI_ENTRY) {
        console.log(`[${symbol}] ENTER LONG`);
        state.inPosition = true;
        await sendSignal(
          "buy",
          state.comments.buy || `ENTER-LONG_BINANCE_${symbol.toUpperCase()}_BOT-NAME_5M`
        );
      }
      if (state.inPosition && prevRSI > RSI_EXIT && lastRSI <= RSI_EXIT) {
        console.log(`[${symbol}] EXIT LONG`);
        state.inPosition = false;
        await sendSignal(
          "sell",
          state.comments.sell || `EXIT-LONG_BINANCE_${symbol.toUpperCase()}_BOT-NAME_5M`
        );
      }
    }
  }
}

// === Webhook Sender ===
async function sendSignal(side, comment) {
  try {
    const form = new FormData();
    form.append('code', comment);

    console.log("Sending webhook (form-data):", { code: comment });
    const res = await axios.post(WUNDER_WEBHOOK, form, {
      headers: form.getHeaders(),
    });
    console.log("Webhook sent:", res.status, res.data);
  } catch (err) {
    console.error("Webhook error:", err);
  }
}

// === APIs ===

// Add a new symbol websocket with configurable buy/sell comments
app.post("/add-symbol", (req, res) => {
  const { symbol, comments } = req.body;
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  if (websockets[symbol]) return res.status(400).json({ error: "symbol already exists" });
  // comments: { buy: 'custom buy comment', sell: 'custom sell comment' }
  connectWebSocket(symbol, comments);
  res.json({ message: `WebSocket for ${symbol} added.` });
});

// Remove an existing symbol websocket
app.post("/remove-symbol", (req, res) => {
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  if (!websockets[symbol]) return res.status(404).json({ error: "symbol not found" });
  websockets[symbol].close();
  delete websockets[symbol];
  delete symbolStates[symbol];
  res.json({ message: `WebSocket for ${symbol} removed.` });
});

// List active symbols
app.get("/symbols", (req, res) => {
  res.json({ symbols: Object.keys(websockets) });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
// Remove old single-symbol logic below this line

// connectWebSocket('api3usdt', {
//   buy: 'ENTER-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585',
//   sell: 'EXIT-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585'
// });

connectWebSocket('ETHUSDT', {
  buy: 'ENTER-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e',
  sell: 'EXIT-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e'
});

// setTimeout(() => {
//   sendSignal('', 'ENTER-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585');
// }, 30 * 1000);
