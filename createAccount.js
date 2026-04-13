const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { Resend } = require("resend");

const GOOGLE_CLIENT_ID =
  "1095022231097-m2jpnjm7fkh0k2kd46hca3p4i8b6v3k0.apps.googleusercontent.com";

const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const resend = new Resend(process.env.RESEND_API);

/**
 * Generate random token
 */
function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Add contact to Resend Audience
 */
async function addContact(name, email) {
  try {
    const [firstName, ...rest] = name.split(" ");
    const lastName = rest.join(" ") || "";

    const { data, error } = await resend.contacts.create({
      email,
      firstName,
      lastName,
      unsubscribed: false,
      audienceId: process.env.RESEND_AUDIENCE_ID, // UUID format (fc90b9ac-...)
    });

    if (error) {
      if (error.name !== "conflict") {
        console.error("Contact add error:", error);
      } else {
        console.log("Contact already exists:", email);
      }
    } else {
      console.log("Contact added:", email);
    }
  } catch (err) {
    console.error("Contact exception:", err);
  }
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(name, email, token) {
  try {
    await resend.emails.send({
      from: "noreply@corelyn.ro",
      to: email,
      subject: "Your Corelyn account is created!",
      html: `
        <h1>Hello ${name}!</h1>
        <p>Your account has been successfully created.</p>
        <p><b>Your token:</b> ${token}</p>
        <p>You can now create an API key.</p>
        <br/>
        <p>Welcome aboard 🚀</p>
      `,
    });

    console.log("Email sent to:", email);
  } catch (err) {
    console.error("Email send error:", err);
  }
}

/**
 * Main export
 */
module.exports = (app, db) => {
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

      // Check if user exists
      const existing = await db.execute({
        sql: "SELECT token FROM accounts WHERE email = ?",
        args: [email],
      });

      if (existing.rows.length > 0) {
        return res.json({ token: existing.rows[0].token });
      }

      // Create token
      const token = generateToken();

      // Save user
      await db.execute({
        sql: "INSERT INTO accounts (username, email, token) VALUES (?, ?, ?)",
        args: [name, email, token],
      });

      // Add to Resend audience
      await addContact(name, email);

      // Send welcome email
      await sendWelcomeEmail(name, email, token);

      return res.json({
        message: "Account created successfully",
        token,
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(400).json({
        error: "Invalid Google token or processing failed",
      });
    }
  });
};
