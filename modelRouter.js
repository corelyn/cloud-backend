const fetch = require("node-fetch");
const { promisify } = require("util");

module.exports = (app, db) => {
  const dbGet = promisify(db.get).bind(db);

  // --- Rate limiting config (per API key) ---
  const rateLimits = new Map();
  const MAX_REQUESTS = 10;       // max requests per window
  const WINDOW_MS = 60 * 1000;   // 1 minute

  function checkRateLimit(apiKey) {
    const now = Date.now();
    if (!rateLimits.has(apiKey)) rateLimits.set(apiKey, []);
    const timestamps = rateLimits.get(apiKey);
    const recent = timestamps.filter(ts => now - ts < WINDOW_MS);

    if (recent.length >= MAX_REQUESTS) return false;

    recent.push(now);
    rateLimits.set(apiKey, recent);
    return true;
  }

  // --- Route handler ---
  app.post("/chat/completions", async (req, res) => {
    try {
      const { apiKey, model, prompt } = req.body;

      // --- Basic validation ---
      if (!apiKey || !model || !prompt) {
        return res.status(400).json({ error: "apiKey, model, and prompt required" });
      }

      if (prompt.length > 5000) {
        return res.status(400).json({ error: "prompt too long (max 5000 chars)" });
      }

      // --- Check API key in database ---
      const key = await dbGet("SELECT * FROM api_keys WHERE api_key = ?", [apiKey]);
      if (!key) return res.status(401).json({ error: "invalid credentials" });

      // --- Rate limit per API key ---
      if (!checkRateLimit(apiKey)) {
        return res.status(429).json({
          error: "rate limit exceeded",
          limit: `${MAX_REQUESTS} requests per minute`,
        });
      }

      // --- Determine provider ---
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

      // --- Setup fetch timeout ---
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      let response;

      if (provider === "nvidia") {
        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
      } else if (provider === "cerebras") {
        response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
      }

      clearTimeout(timeout);

      // --- Handle provider errors ---
      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({ error: "provider error", details: text });
      }

      // --- Return data ---
      const data = await response.json();
      res.json(data);

    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "request timed out" });
      }
      res.status(500).json({ error: "request failed", details: e.message });
    }
  });
};
