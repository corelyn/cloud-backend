const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const GOOGLE_CLIENT_ID = "1095022231097-m2jpnjm7fkh0k2kd46hca3p4i8b6v3k0.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

function generateToken() {
    return crypto.randomBytes(16).toString("hex");
}

module.exports = (app, db) => {

    /*
    GOOGLE LOGIN
    */
    app.post("/google-login", async (req, res) => {

        const { credential } = req.body;

        if (!credential) {
            return res.json({ error: "missing credential" });
        }

        try {

            const ticket = await client.verifyIdToken({
                idToken: credential,
                audience: GOOGLE_CLIENT_ID
            });

            const payload = ticket.getPayload();

            const email = payload.email;
            const name = payload.name;

            // Check if user already exists
            db.get(
                "SELECT token FROM accounts WHERE email = ?",
                [email],
                (err, row) => {

                    if (err) {
                        return res.json({ error: "database error" });
                    }

                    // Existing user
                    if (row) {
                        return res.json({
                            token: row.token
                        });
                    }

                    // Create new account
                    const token = generateToken();

                    db.run(
                        "INSERT INTO accounts (username, email, token) VALUES (?, ?, ?)",
                        [name, email, token],
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

                }
            );

        } catch (err) {

            res.json({
                error: "invalid google token"
            });

        }

    });

};
