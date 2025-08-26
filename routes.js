const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");

module.exports = (bots, rsiConfig, createNewSymbolBot) => {
  // POST /symbols – add & start a bot
  router.post("/symbols", async (req, res) => {
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
      inLong,
    });
  });

  // DELETE /symbols/:symbol – stop & remove a bot
  router.delete("/symbols/:symbol", (req, res) => {
    const key = req.params.symbol.toLowerCase();
    const bot = bots.get(key);
    if (!bot) return res.status(404).json({ error: "Symbol not found" });
    bot.stop();
    bots.delete(key);
    res.json({ message: "Symbol removed", symbol: key });
  });

  // GET /symbols – list active bots
  router.get("/symbols", (req, res) => {
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
  router.patch("/symbols/:symbol/status", (req, res) => {
    const key = req.params.symbol.toLowerCase();
    const bot = bots.get(key);
    if (!bot) return res.status(404).json({ error: "Symbol not found" });

    const { inLong } = req.body;
    if (typeof inLong !== "boolean")
      return res.status(400).json({ error: "inLong must be boolean" });

    bot.inLong = inLong;
    res.json({ message: "Status updated", symbol: key, inLong: bot.inLong });
  });

  // PATCH /rsi-config – update RSI parameters
  router.patch("/rsi-config", (req, res) => {
    const { period, entry, exit } = req.body;
    if (period !== undefined) {
      if (typeof period !== "number" || period < 1)
        return res
          .status(400)
          .json({ error: "period must be a positive number" });
      rsiConfig.period = period;
    }
    if (entry !== undefined) {
      if (typeof entry !== "number" || entry < 0 || entry > 100)
        return res
          .status(400)
          .json({ error: "entry must be between 0 and 100" });
      rsiConfig.entry = entry;
    }
    if (exit !== undefined) {
      if (typeof exit !== "number" || exit < 0 || exit > 100)
        return res
          .status(400)
          .json({ error: "exit must be between 0 and 100" });
      rsiConfig.exit = exit;
    }
    res.json({ message: "RSI config updated", rsiConfig });
  });

  // GET /rsi-config – get current RSI parameters
  router.get("/rsi-config", (req, res) => {
    res.json(rsiConfig);
  });

  // POST /webhook/:symbol – trigger sendWebhook for a bot
  router.post("/webhook/:symbol", async (req, res) => {
    const key = req.params.symbol.toLowerCase();
    const bot = bots.get(key);
    if (!bot) return res.status(404).json({ error: "Symbol not found" });

    const { payload } = req.body;
    if (!payload || typeof payload !== "object")
      return res.status(400).json({ error: "Missing or invalid payload" });

    try {
      await bot.sendWebhook(payload);
      res.json({ message: "Webhook triggered", symbol: key, payload });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v3/order – create a new Binance order
  router.post("/order", async (req, res) => {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: "Binance API credentials not set" });
    }

    const baseUrl = "https://api.binance.com";
    const endpoint = "/api/v3/order";
    const params = req.body;

    // Add timestamp if not present
    params.timestamp = params.timestamp || Date.now();

    // Create query string
    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");

    // Sign the query string
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(query)
      .digest("hex");

    // Final query string with signature
    const finalQuery = `${query}&signature=${signature}`;

    try {
      const response = await axios.post(
        `${baseUrl}${endpoint}?${finalQuery}`,
        {},
        {
          headers: {
            "X-MBX-APIKEY": apiKey,
            "Content-Type": "application/json",
          },
        }
      );
      res.json(response.data);
    } catch (err) {
      res
        .status(err.response?.status || 500)
        .json({ error: err.response?.data || err.message });
    }
  });

  return router;
};
