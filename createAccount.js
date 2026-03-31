import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { Resend } from "resend";

const GOOGLE_CLIENT_ID = "1095022231097-m2jpnjm7fkh0k2kd46hca3p4i8b6v3k0.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const resend = new Resend(process.env.RESEND_API);

/**
 * Generate a random token
 */
function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Send welcome email using Resend transactional API
 */
async function sendWelcomeEmail(name, email, token) {
  try {
    await resend.emails.send({
      from: "noreply@yourdomain.com",
      to: email,
      subject: "Your Corelyn account is created!",
      html: `
        <h1>Hello ${name}!</h1>
        <p>Your Corelyn account and domain have been successfully created.</p>
        <p>Your token: <b>${token}</b></p>
        <p>Now you can create a API key!</p>
        <p>Thank you for joining us!</p>
      `,
    });
    console.log("Welcome email sent to", email);
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}

/**
 * Export function to setup routes
 */
export default (app, db) => {
  app.post("/google-login", async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Missing credential" });
    }

    try {
      // Verify Google token
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const email = payload.email;
      const name = payload.name;

      // Check if user already exists
      const existing = await db.execute({
        sql: "SELECT token FROM accounts WHERE email = ?",
        args: [email],
      });

      if (existing.rows.length > 0) {
        return res.json({ token: existing.rows[0].token });
      }

      // Create new account
      const token = generateToken();

      await db.execute({
        sql: "INSERT INTO accounts (username, email, token) VALUES (?, ?, ?)",
        args: [name, email, token],
      });

      // Send welcome email
      await sendWelcomeEmail(name, email, token);

      res.json({ message: "Account created and email sent", token });

    } catch (err) {
      console.error(err);
      res.status(400).json({ error: "Invalid Google token or email failed to send" });
    }
  });
};
