const axios = require("axios");

const API_URL = `${
  process.env.HOST || "https://binance-monitor-pine-script.onrender.com"
}/symbols`;

async function pollSymbols() {
  try {
    const res = await axios.get(API_URL);
    console.log("[Worker] Active symbols:", res.status);
  } catch (err) {
    console.error("[Worker] Error fetching symbols:", err.message);
  }
}

// Poll every 1 minute
setInterval(pollSymbols, 60 * 1000);

// Initial call
// pollSymbols();
