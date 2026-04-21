const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

module.exports = (app, db) => {

    const rateLimits = new Map();

    const MINUTE_LIMIT = 10;
    const MINUTE_WINDOW = 60 * 1000;

    const DAILY_LIMIT = 60;
    const DAILY_WINDOW = 24 * 60 * 60 * 1000;

    function checkRateLimit(apiKey) {
        const now = Date.now();

        if (!rateLimits.has(apiKey)) {
            rateLimits.set(apiKey, { minute: [], day: [] });
        }

        const limits = rateLimits.get(apiKey);

        limits.minute = limits.minute.filter(ts => now - ts < MINUTE_WINDOW);
        limits.day = limits.day.filter(ts => now - ts < DAILY_WINDOW);

        if (limits.minute.length >= MINUTE_LIMIT) {
            return { allowed: false, error: "minute" };
        }

        if (limits.day.length >= DAILY_LIMIT) {
            return { allowed: false, error: "day" };
        }

        limits.minute.push(now);
        limits.day.push(now);

        return { allowed: true };
    }

    async function handleChat({ apiKey, model, messages, temperature, max_tokens }) {

        // Validate API key
        const keyResult = await db.execute({
            sql: "SELECT * FROM api_keys WHERE api_key = ?",
            args: [apiKey]
        });

        if (keyResult.rows.length === 0) {
            throw { status: 401, message: "Invalid API key" };
        }

        // Rate limit
        const limitCheck = checkRateLimit(apiKey);
        if (!limitCheck.allowed) {
            throw { status: 429, message: "Rate limit exceeded" };
        }

        let provider, modelName;

        if (model.startsWith("nvidia/")) {
            provider = "nvidia";
            modelName = model.replace("nvidia/", "");
        } else if (model.startsWith("cerebras/")) {
            provider = "cerebras";
            modelName = model.replace("cerebras/", "");
        } else {
            throw { status: 400, message: "Unsupported model provider" };
        }

        const payload = {
            model: modelName,
            messages,
            temperature,
            max_tokens
        };

        let upstream;

        if (provider === "nvidia") {
            upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
        } else {
            upstream = await fetch("https://api.cerebras.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
        }

        if (!upstream.ok) {
            const text = await upstream.text();
            throw { status: 502, message: text };
        }

        return await upstream.json();
    }

    // -------------------------
    // 🔹 YOUR ORIGINAL ENDPOINT
    // -------------------------
    app.post("/chat/completions", async (req, res) => {
        try {
            const { apiKey, model, messages, temperature, max_tokens } = req.body;

            if (!apiKey || !model || !messages) {
                return res.status(400).json({ error: "apiKey, model, messages required" });
            }

            const data = await handleChat({ apiKey, model, messages, temperature, max_tokens });

            res.json(data);

        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "request failed"
            });
        }
    });

    // -------------------------
    // 🔹 OPENAI COMPAT ENDPOINT
    // -------------------------
    app.post("/oai/chat/completions", async (req, res) => {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).json({
                    error: {
                        message: "Missing Authorization header",
                        type: "invalid_request_error"
                    }
                });
            }

            const apiKey = authHeader.split(" ")[1];

            const { model, messages, temperature, max_tokens } = req.body;

            if (!model || !messages) {
                return res.status(400).json({
                    error: {
                        message: "model and messages required",
                        type: "invalid_request_error"
                    }
                });
            }

            const data = await handleChat({ apiKey, model, messages, temperature, max_tokens });

            // Normalize response
            const response = {
                id: `chatcmpl-${uuidv4()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: data.choices?.[0]?.message?.content || ""
                        },
                        finish_reason: data.choices?.[0]?.finish_reason || "stop"
                    }
                ],
                usage: data.usage || {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };

            res.json(response);

        } catch (err) {
            res.status(err.status || 500).json({
                error: {
                    message: err.message || "server_error",
                    type: "server_error"
                }
            });
        }
    });
};
