// Install deps first:
// npm install ws axios technicalindicators
const WebSocket = require("ws");
const axios = require("axios");
const ti = require("technicalindicators");
// === Config ===
const SYMBOL = "api3usdt"; // Trading pair (matches BINANCE_API3USDT)
const INTERVAL = "5m"; // Candle interval
const RSI_PERIOD = 7;
const RSI_ENTRY = 65;
const RSI_EXIT = 20;
// WunderExchange webhook for your signal bot
const WUNDER_WEBHOOK = "https://wtalerts.com/bot/trading_view";
// === State ===
let closes = [];
let inPosition = false;
let ws;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// WebSocket URL validation
const wsUrl = `wss://stream.binance.com:9443/ws/${SYMBOL}@kline_${INTERVAL}`;
console.log(`🔗 Connecting to: ${wsUrl}`);

function connectWebSocket() {
  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("✅ WebSocket connected successfully");
    reconnectAttempts = 0;
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error.message);
    console.error("Error details:", error);
  });

  ws.on("close", (code, reason) => {
    console.log(`🔌 WebSocket disconnected - Code: ${code}, Reason: ${reason}`);

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(
        `🔄 Reconnecting... Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
      );
      setTimeout(connectWebSocket, 5000);
    } else {
      console.error("❌ Max reconnection attempts reached");
    }
  });

  ws.on("message", handleMessage);
}

// Start connection
connectWebSocket();

// Check connection status
function checkConnection() {
  const status = ws ? ws.readyState : "NO_CONNECTION";
  const statusText =
    status === WebSocket.OPEN
      ? "CONNECTED"
      : status === WebSocket.CONNECTING
      ? "CONNECTING"
      : status === WebSocket.CLOSING
      ? "CLOSING"
      : "DISCONNECTED";
  console.log(`🔍 WebSocket status: ${statusText}`);
}

setInterval(checkConnection, 10000);
async function handleMessage(msg) {
  const data = JSON.parse(msg);
  // Only process when candle closes
  if (data.k && data.k.x) {
    // console.log("data = ", data);
    const close = parseFloat(data.k.c);
    closes.push(close);
    if (closes.length > RSI_PERIOD) {
      const rsi = ti.RSI.calculate({ period: RSI_PERIOD, values: closes });
      const lastRSI = rsi[rsi.length - 1];
      const prevRSI = rsi[rsi.length - 2];
      console.log(
        `RSI: ${lastRSI.toFixed(2)} | Position: ${inPosition ? "LONG" : "FLAT"}`
      );
      // === Entry Condition (RSI crossover above 65) ===
      if (!inPosition && prevRSI < RSI_ENTRY && lastRSI >= RSI_ENTRY) {
        console.log("ENTER LONG");
        inPosition = true;
        await sendSignal(
          "buy",
          "ENTER-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585"
        );
      }
      // === Exit Condition (RSI crossunder below 20) ===
      if (inPosition && prevRSI > RSI_EXIT && lastRSI <= RSI_EXIT) {
        console.log("EXIT LONG");
        inPosition = false;
        await sendSignal(
          "sell",
          "EXIT-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585"
        );
      }
    }
  }
}
// === Webhook Sender ===
async function sendSignal(side, comment) {
  try {
    const payload = {
      symbol: "API3USDT",
      side: side, // "buy" or "sell"
      type: "market",
      amount: 10, // <-- adjust position size
      comment: comment, // Matches TradingView comments
    };
    const res = await axios.post(WUNDER_WEBHOOK, payload);
    console.log("Webhook sent:", res.status, res.data);
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
}
