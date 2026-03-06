const crypto = require("crypto");

function generateToken() {
    return crypto.randomBytes(16).toString("hex");
}

module.exports = (app, db) => {

    app.post("/create-account", (req, res) => {

        const { username } = req.body;

        if (!username) {
            return res.json({ error: "username required" });
        }

        const token = generateToken();

        db.run(
            "INSERT INTO accounts (username, token) VALUES (?, ?)",
            [username, token],
            function(err) {

                if (err) {
                    return res.json({ error: "database error" });
                }

                res.json({
                    message: "account created",
                    token: token
                });

            }
        );

    });

};
