const fetch = require("node-fetch");

module.exports = (app, db) => {

    app.post("/chat/completions", async (req, res) => {

        const { apiKey, model, prompt } = req.body;

        if (!apiKey || !model || !prompt) {
            return res.json({ error: "apiKey, model, and prompt required" });
        }

        // check if key exists
        db.get(
            "SELECT * FROM api_keys WHERE api_key = ?",
            [apiKey],
            async (err, key) => {

                if (err) {
                    return res.json({ error: "database error" });
                }

                if (!key) {
                    return res.json({ error: "invalid api key" });
                }

                try {

                    let provider;
                    let modelName;

                    if (model.startsWith("nvidia/")) {
                        provider = "nvidia";
                        modelName = model.replace("nvidia/", "");
                    }
                    else if (model.startsWith("cerebras/")) {
                        provider = "cerebras";
                        modelName = model.replace("cerebras/", "");
                    }
                    else {
                        return res.json({ error: "unsupported provider" });
                    }

                    let response;

                    if (provider === "nvidia") {

                        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`
                            },
                            body: JSON.stringify({
                                model: modelName,
                                messages: [
                                    { role: "user", content: prompt }
                                ]
                            })
                        });

                    }

                    if (provider === "cerebras") {

                        response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}`
                            },
                            body: JSON.stringify({
                                model: modelName,
                                messages: [
                                    { role: "user", content: prompt }
                                ]
                            })
                        });

                    }

                    const data = await response.json();

                    res.json(data);

                } catch (e) {

                    res.json({
                        error: "request failed",
                        details: e.message
                    });

                }

            }
        );

    });

};
