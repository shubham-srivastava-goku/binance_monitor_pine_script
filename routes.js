const express = require("express");
const router = express.Router();

module.exports = (bots, rsiConfig, createNewSymbolBot, binance) => {
  // POST /symbols – add & start a bot
  router.post("/symbols", async (req, res) => {
    const { symbol, interval, inLong } = req.body;
    if (!symbol || !interval) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const key = symbol.toLowerCase();
    if (bots.has(key)) {
      return res.status(409).json({ error: "Symbol already exists" });
    }
    await createNewSymbolBot(res, {
      symbol: key,
      interval,
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
        inLong: bot.inLong,
      });
    }
    res.json(list);
  });

  router.patch("/symbols/:symbol/status", async (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const bot = bots.get(symbol);
    if (!bot) {
      return res.status(404).json({ error: "Bot not found for symbol" });
    }

    // Update inLong status if provided
    if (typeof req.body.inLong === "boolean") {
      bot.inLong = req.body.inLong;
    }

    // Update buyLimit if provided
    if (typeof req.body.buyLimit === "number" && req.body.buyLimit > 0) {
      bot.buyLimit = req.body.buyLimit;
    }

    res.json({
      symbol,
      inLong: bot.inLong,
      buyLimit: bot.buyLimit,
      message: "Bot status updated",
    });
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
    try {
      const params = req.body;

      const { quantity, price, symbol } = params;
      if (!quantity || !price) {
        return res.status(400).json({ error: "Missing quantity or price" });
      }

      const binance = new Binance({
        APIKEY: apiKey,
        APISECRET: apiSecret,
      });

      const response = await binance.buy(symbol, quantity, price, {
        type: "LIMIT",
      });
      console.info("Limit Buy response", response);
      console.info("order id: " + response.orderId);

      res.json(response);
    } catch (err) {
      console.error("Order Error:", err.body || err.message);
      res.status(err.status || 500).json({ error: err.body || err.message });
    }
  });

  return router;
};
