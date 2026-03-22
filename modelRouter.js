const fetch = require("node-fetch");
const { promisify } = require("util");

module.exports = (app, db) => {
  const dbGet = promisify(db.get).bind(db);

  // --- Rate limiting config ---
  const rateLimits = new Map();

  const MINUTE_LIMIT = 10;
  const MINUTE_WINDOW = 60 * 1000;

  const DAILY_LIMIT = 60;
  const DAILY_WINDOW = 24 * 60 * 60 * 1000;

  function checkRateLimit(apiKey) {
    const now = Date.now();

    if (!rateLimits.has(apiKey)) {
      rateLimits.set(apiKey, {
        minute: [],
        day: []
      });
    }

    const limits = rateLimits.get(apiKey);

    // --- Clean old timestamps ---
    limits.minute = limits.minute.filter(ts => now - ts < MINUTE_WINDOW);
    limits.day = limits.day.filter(ts => now - ts < DAILY_WINDOW);

    // --- Check limits ---
    if (limits.minute.length >= MINUTE_LIMIT) {
      return { allowed: false, error: "minute" };
    }

    if (limits.day.length >= DAILY_LIMIT) {
      return { allowed: false, error: "day" };
    }

    // --- Record request ---
    limits.minute.push(now);
    limits.day.push(now);

    rateLimits.set(apiKey, limits);

    return { allowed: true };
  }

  app.post("/chat/completions", async (req, res) => {
    try {
      const { apiKey, model, prompt } = req.body;

      if (!apiKey || !model || !prompt) {
        return res.status(400).json({ error: "apiKey, model, and prompt required" });
      }

      if (prompt.length > 5000) {
        return res.status(400).json({ error: "prompt too long (max 5000 chars)" });
      }

      // --- Check API key ---
      const key = await dbGet("SELECT * FROM api_keys WHERE api_key = ?", [apiKey]);
      if (!key) return res.status(401).json({ error: "invalid credentials" });

      // --- Check limits ---
      const limitCheck = checkRateLimit(apiKey);

      if (!limitCheck.allowed) {
        if (limitCheck.error === "minute") {
          return res.status(429).json({
            error: "rate limit exceeded",
            limit: `${MINUTE_LIMIT} requests per minute`
          });
        }

        if (limitCheck.error === "day") {
          return res.status(429).json({
            error: "daily limit reached",
            limit: `${DAILY_LIMIT} requests per 24 hours`
          });
        }
      }

      let provider, modelName;

      if (model.startsWith("nvidia/")) {
        provider = "nvidia";
        modelName = model.replace("nvidia/", "");
      } else if (model.startsWith("cerebras/")) {
        provider = "cerebras";
        modelName = model.replace("cerebras/", "");
      } else {
        return res.status(400).json({ error: "unsupported provider" });
      }

      let response;

      if (provider === "nvidia") {
        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }]
          })
        });
      } else if (provider === "cerebras") {
        response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }]
          })
        });
      }

      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({ error: "provider error", details: text });
      }

      const data = await response.json();
      res.json(data);

    } catch (e) {
      res.status(500).json({ error: "request failed", details: e.message });
    }
  });
};
