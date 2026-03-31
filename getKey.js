const crypto = require("crypto");

function generateKey() {
    return "crlyn-" + crypto.randomBytes(6).toString("hex");
}

module.exports = (app, db) => {

    app.post("/get-key", async (req, res) => {

        const { token } = req.body;

        if (!token) {
            return res.json({ error: "token required" });
        }

        const accountResult = await db.execute({
            sql: "SELECT * FROM accounts WHERE token = ?",
            args: [token]
        });

        if (accountResult.rows.length === 0) {
            return res.json({ error: "invalid token" });
        }

        const account = accountResult.rows[0];

        const keysResult = await db.execute({
            sql: "SELECT * FROM api_keys WHERE account_id = ?",
            args: [account.id]
        });

        if (keysResult.rows.length >= 3) {
            return res.json({ error: "max 3 api keys reached" });
        }

        const key = generateKey();

        await db.execute({
            sql: "INSERT INTO api_keys (account_id, api_key) VALUES (?, ?)",
            args: [account.id, key]
        });

        res.json({ key });

    });

};
