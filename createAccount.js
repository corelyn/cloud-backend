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
            const existing = await db.execute({
                sql: "SELECT token FROM accounts WHERE email = ?",
                args: [email]
            });

            if (existing.rows.length > 0) {
                return res.json({ token: existing.rows[0].token });
            }

            // Create new account
            const token = generateToken();

            await db.execute({
                sql: "INSERT INTO accounts (username, email, token) VALUES (?, ?, ?)",
                args: [name, email, token]
            });

            res.json({ message: "account created", token });

        } catch (err) {
            res.json({ error: "invalid google token" });
        }

    });

};
