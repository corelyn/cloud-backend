const crypto = require("crypto");

function generateKey() {
    return "crlyn-" + crypto.randomBytes(6).toString("hex");
}

module.exports = (app, db) => {

    app.post("/get-key", (req, res) => {

        const { token } = req.body;

        if (!token) {
            return res.json({ error: "token required" });
        }

        db.get(
            "SELECT * FROM accounts WHERE token = ?",
            [token],
            (err, account) => {

                if (!account) {
                    return res.json({ error: "invalid token" });
                }

                db.all(
                    "SELECT * FROM api_keys WHERE account_id = ?",
                    [account.id],
                    (err, keys) => {

                        if (keys.length >= 3) {
                            return res.json({ error: "max 3 api keys reached" });
                        }

                        const key = generateKey();

                        db.run(
                            "INSERT INTO api_keys (account_id, api_key) VALUES (?, ?)",
                            [account.id, key],
                            () => {

                                res.json({
                                    key: key
                                });

                            }
                        );

                    }
                );

            }
        );

    });

};
