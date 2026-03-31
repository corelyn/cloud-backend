const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const Resend = require("resend");

const GOOGLE_CLIENT_ID = "1095022231097-m2jpnjm7fkh0k2kd46hca3p4i8b6v3k0.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Use environment variable for Resend API key
const resend = new Resend(process.env.RESEND_API);

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

            // Send welcome email using Resend
            await resend.emails.send({
                from: "noreply@corelyn.ro",
                to: email,
                subject: "Your account/domain is created!",
                html: `
                    <h1>Hello ${name}!</h1>
                    <p>Your account and domain have been successfully created.</p>
                    <p>Your token: <b>${token}</b></p>
                    <p>Thank you for joining us!</p>
                `
            });

            res.json({ message: "account created and email sent", token });

        } catch (err) {
            console.error(err);
            res.json({ error: "invalid google token or email failed to send" });
        }

    });

};
