const express = require("express");
const router = express.Router();

module.exports = (bots, rsiConfig, createNewSymbolBot, SYMBOL_RSI_CONFIGS) => {
  // POST /symbols – add & start a bot
  router.post("/symbols", async (req, res) => {
    const { symbol, interval, inLong, buyLimit } = req.body;
    console.log("Received request to add symbol:", req.body);
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
      buyLimit,
    });
  });

  // DELETE /symbols/:symbol – stop & remove a bot
  router.delete("/symbols/:symbol", async (req, res) => {
    try {
      const key = req.params.symbol.toLowerCase();
      const bot = bots.get(key);

      if (!bot) {
        return res.status(404).json({ error: "Symbol not found" });
      }

      // Call stop and wait for cleanup
      const stopped = bot.stop();

      if (!stopped) {
        return res.status(500).json({
          error: "Failed to stop the bot properly",
          symbol: key,
        });
      }

      // Remove from bots map
      bots.delete(key);

      res.json({
        message: "Symbol removed successfully",
        symbol: key,
      });
    } catch (err) {
      console.error(`Error removing symbol:`, err);
      res.status(500).json({
        error: "Internal server error while removing symbol",
        message: err.message,
      });
    }
  });

  // GET /symbols – list active bots
  router.get("/symbols", (req, res) => {
    const list = [];
    for (const [key, bot] of bots.entries()) {
      list.push({
        symbol: key,
        interval: bot.interval,
        inLong: bot.inLong,
        buyLimit: bot.buyLimit,
        rsiConfig: bot.rsiConfig,
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
    console.log("Update request body:", req.body, req.body.buyLimit);

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
      ...bot,
      message: "Bot status updated",
    });
  });

  // PATCH /symbols/:symbol/rsi-config - update RSI configuration for a specific bot
  router.patch("/symbols/:symbol/rsi-config", async (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    console.log(`Received RSI config update for ${symbol}:`, req.body);
    try {
      const bot = bots.get(symbol);

      if (!bot) {
        return res.status(404).json({ error: "Bot not found for symbol" });
      }

      const { entry, exit, period } = req.body;

      // Validate the input parameters
      if (
        entry !== undefined &&
        (typeof entry !== "number" || entry < 0 || entry > 100)
      ) {
        return res
          .status(400)
          .json({ error: "Entry value must be a number between 0 and 100" });
      }

      if (
        exit !== undefined &&
        (typeof exit !== "number" || exit < 0 || exit > 100)
      ) {
        return res
          .status(400)
          .json({ error: "Exit value must be a number between 0 and 100" });
      }

      if (period !== undefined && (typeof period !== "number" || period < 1)) {
        return res
          .status(400)
          .json({ error: "Period must be a positive number" });
      }

      // Update the bot's RSI configuration
      if (entry !== undefined) bot.rsiConfig.entry = entry;
      if (exit !== undefined) bot.rsiConfig.exit = exit;
      if (period !== undefined) {
        bot.rsiConfig.period = period;
        // Reinitialize RSI with new period
        bot.rsi = new RSI({ period: period, values: [] });
        // Reseed historical closes with new period
        await bot.seedHistoricalCloses();
      }

      // Update the global SYMBOL_RSI_CONFIGS
      if (!SYMBOL_RSI_CONFIGS[symbol]) {
        SYMBOL_RSI_CONFIGS[symbol] = {};
      }
      if (entry !== undefined) SYMBOL_RSI_CONFIGS[symbol].entry = entry;
      if (exit !== undefined) SYMBOL_RSI_CONFIGS[symbol].exit = exit;

      res.json({
        symbol,
        rsiConfig: bot.rsiConfig,
        message: "RSI configuration updated successfully",
      });
    } catch (err) {
      console.error(`Error updating RSI config for ${symbol}:`, err);
      res.status(500).json({
        error: "Internal server error while updating RSI configuration",
        message: err.message,
      });
    }
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
