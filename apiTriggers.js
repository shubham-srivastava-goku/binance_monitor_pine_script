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
  side: "BUY",
  type: "LIMIT",
  // quantity: 6,
  // price: "4000.00",
  // timeInForce: "GTC",
  // icebergQty: "3.0",
  // recvWindow: 5000,
};

triggerOrder(orderParamsExample);

// Uncomment to run examples directly
// runExampleTriggers();

// triggerUpdateSymbolStatus("api3usdt", true);
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
};
