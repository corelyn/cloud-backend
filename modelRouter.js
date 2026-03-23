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
      const { apiKey, model, messages } = req.body;

      if (!apiKey || !model || !messages) {
        return res.status(400).json({ error: "apiKey, model, and messages required" });
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages must be a non-empty array" });
      }

      // --- Check message length ---
      const totalLength = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
      if (totalLength > 5000) {
        return res.status(400).json({ error: "messages too long (max 5000 chars total)" });
      }

      // --- Check API key ---
      const key = await dbGet("SELECT * FROM api_keys WHERE api_key = ?", [apiKey]);
      if (!key) return res.status(401).json({ error: "invalid credentials" });

      // --- Check limits ---
      const limitCheck = checkRateLimit(apiKey);
      if (!limitCheck.allowed) {
        const msg = limitCheck.error === "minute"
          ? `${MINUTE_LIMIT} requests per minute`
          : `${DAILY_LIMIT} requests per 24 hours`;
        return res.status(429).json({ error: "rate limit exceeded", limit: msg });
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

      // --- Prepare API request payload ---
      const apiMessages = messages.map(m => ({
        role: m.role, // can be "system" or "user"
        content: m.content
      }));

      let response;

      if (provider === "nvidia") {
        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`
          },
          body: JSON.stringify({ model: modelName, messages: apiMessages })
        });
      } else if (provider === "cerebras") {
        response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`
          },
          body: JSON.stringify({ model: modelName, messages: apiMessages })
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
