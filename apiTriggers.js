const axios = require("axios");

const BASE_URL =
  process.env.HOST || "https://binance-monitor-pine-script.onrender.com";

// Function to trigger POST /symbols
async function triggerAddSymbol({
  symbol,
  interval,
  entryMessage,
  exitMessage,
  inLong,
}) {
  try {
    const res = await axios.post(`${BASE_URL}/symbols`, {
      symbol,
      interval,
      entryMessage,
      exitMessage,
      inLong,
    });
    console.log("Add Symbol Response:", res.data);
    return res.data;
  } catch (err) {
    console.error("Add Symbol Error:", err.response?.data || err.message);
  }
}

// Function to trigger DELETE /symbols/:symbol
async function triggerDeleteSymbol(symbol) {
  try {
    const res = await axios.delete(`${BASE_URL}/symbols/${symbol}`);
    console.log("Delete Symbol Response:", res.data);
    return res.data;
  } catch (err) {
    console.error("Delete Symbol Error:", err.response?.data || err.message);
  }
}

// Function to trigger GET /symbols
async function triggerListSymbols() {
  try {
    const res = await axios.get(`${BASE_URL}/symbols`);
    console.log("List Symbols Response:", res.data);
    return res.data;
  } catch (err) {
    console.error("List Symbols Error:", err.response?.data || err.message);
  }
}

// Function to trigger PATCH /symbols/:symbol/status
async function triggerUpdateSymbolStatus(symbol, inLong) {
  try {
    const res = await axios.patch(`${BASE_URL}/symbols/${symbol}/status`, {
      inLong,
    });
    console.log("Update Symbol Status Response:", res.data);
    return res.data;
  } catch (err) {
    console.error(
      "Update Symbol Status Error:",
      err.response?.data || err.message
    );
  }
}

// Example calls using values from index.js line 209
async function runExampleTriggers() {
  await triggerAddSymbol({
    symbol: "ethusdt",
    interval: "5m",
    entryMessage:
      "ENTER-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
    exitMessage:
      "EXIT-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
  });

  await triggerAddSymbol({
    symbol: "api3usdt",
    interval: "5m",
    entryMessage:
      "ENTER-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585",
    exitMessage:
      "EXIT-LONG_BINANCE_API3USDT_BOT-NAME-RDSh9d_5M_ed68632a927ae2e945f77585",
  });

  await triggerListSymbols();

  await triggerUpdateSymbolStatus("ethusdt", true);

  await triggerDeleteSymbol("api3usdt");
}

// Uncomment to run examples directly
// runExampleTriggers();

// triggerUpdateSymbolStatus("api3usdt", true);
triggerListSymbols();

module.exports = {
  triggerAddSymbol,
  triggerDeleteSymbol,
  triggerListSymbols,
  triggerUpdateSymbolStatus,
};
