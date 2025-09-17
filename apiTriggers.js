const axios = require("axios");

const BASE_URL =
  process.env.HOST || "https://binance-monitor-pine-script.onrender.com";

// Function to trigger POST /symbols
async function triggerAddSymbol({ symbol, interval, inLong, buyLimit }) {
  try {
    const res = await axios.post(`${BASE_URL}/symbols`, {
      symbol,
      interval,
      inLong,
      buyLimit,
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

/**
 * Triggers PATCH /symbols/:symbol/status with a flexible payload.
 * @param {string} symbol - The trading symbol.
 * @param {Object} statusParams - The status parameters (e.g., { inLong, buyLimit, interval }).
 * @returns {Promise<Object>} - The response from the backend.
 */
async function triggerUpdateSymbolStatus(symbol, statusParams) {
  try {
    const res = await axios.patch(
      `${BASE_URL}/symbols/${symbol}/status`,
      statusParams
    );
    console.log("Update Symbol Status Response:", res.data);
    return res.data;
  } catch (err) {
    console.error(
      "Update Symbol Status Error:",
      err.response?.data || err.message
    );
  }
}

/**
 * Triggers PATCH /symbols/:symbol/rsi-config to update RSI configuration for a specific bot.
 * @param {string} symbol - The trading symbol (e.g., 'ethusdt').
 * @param {Object} rsiConfig - The RSI config object (e.g., { entry, exit, period }).
 * @returns {Promise<Object>} - The response from the backend.
 */
async function triggerUpdateSymbolRsiConfig(symbol, rsiConfig) {
  try {
    const res = await axios.patch(
      `${BASE_URL}/symbols/${symbol}/rsi-config`,
      rsiConfig
    );
    console.log("Update Symbol RSI Config Response:", res.data);
    return res.data;
  } catch (err) {
    console.error(
      "Update Symbol RSI Config Error:",
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

async function triggerWebhook(symbol, payload) {
  try {
    const url = `${BASE_URL}/webhook/${symbol.toLowerCase()}`;
    const response = await axios.post(url, { payload });
    console.log("Update Symbol Status Response:", response.data);
    return response.data;
  } catch (err) {
    console.error(
      "Update Symbol Status Error:",
      err.response?.data || err.message
    );
  }
}

/**
 * Triggers the /order API on the local backend.
 * @param {Object} orderParams - The order parameters for Binance.
 * @returns {Promise<Object>} - The response from the backend.
 */
async function triggerOrder(orderParams) {
  try {
    const response = await axios.post(`${BASE_URL}/order`, orderParams, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("Order Response:", response.data);
    return response.data;
  } catch (err) {
    console.error("Order Error:", err.response?.data || err.message);
  }
}

const orderParamsExample = {
  symbol: "ETHUSDT",
  // side: "BUY",
  // type: "LIMIT",
  quantity: "0.0024",
  price: "4000.00",
  // timeInForce: "GTC",
  // icebergQty: "3.0",
  // recvWindow: 5000,
};

// triggerOrder(orderParamsExample);

// Uncomment to run examples directly
// runExampleTriggers();

// triggerUpdateSymbolStatus("avaxusdt", { inLong: true, buyLimit: 15 });
// triggerUpdateSymbolStatus("ethusdt", { inLong: false, buyLimit: 15 });
// triggerUpdateSymbolStatus("wlfiusdt", { inLong: false, buyLimit: 15 });
// // triggerUpdateSymbolStatus("solusdt", { inLong: true, buyLimit: 15 });
// triggerUpdateSymbolStatus("trxusdt", { inLong: true, buyLimit: 15 });
triggerUpdateSymbolStatus("bnbusdt", { inLong: true, buyLimit: 15 });
// triggerDeleteSymbol("avaxusdt");
// triggerDeleteSymbol('solusdt');
// triggerDeleteSymbol("bnbusdt");
// triggerListSymbols();

triggerListSymbols();

// triggerUpdateSymbolRsiConfig("trxusdt", { entry: 65, exit: 20 });
// triggerUpdateSymbolRsiConfig("bnbusdt", { entry: 65, exit: 20 });

// triggerAddSymbol({
//   symbol: "avaxusdt",
//   interval: "5m",
//   entryMessage:
//     "ENTER-LONG_BINANCE_MULTIPLE-PAIRS_AVAXUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
//   exitMessage:
//     "EXIT-LONG_BINANCE_MULTIPLE-PAIRS_AVAXUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
//   inLong: true,
// });

// triggerAddSymbol({
//   symbol: "wlfiusdt", // "ethusdt",
//   interval: "5m",
//   inLong: false,
//   buyLimit: 5,
// });

// triggerAddSymbol({
//   symbol: "dolousdt", // "ethusdt",
//   interval: "5m",
//   inLong: false,
//   buyLimit: 5,
// });

// triggerListSymbols();

// triggerWebhook("ethusdt", {
//   comment:
//     "ENTER-LONG_BINANCE_MULTIPLE-PAIRS_ETHUSDT-TYb3rA_5M_ed54632ab97ae2e94555752e",
// });

module.exports = {
  triggerAddSymbol,
  triggerDeleteSymbol,
  triggerListSymbols,
  triggerUpdateSymbolStatus,
  triggerWebhook,
  triggerOrder,
  triggerUpdateSymbolRsiConfig,
};
