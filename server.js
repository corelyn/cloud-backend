require("dotenv").config({ path: "./.env" });

const express = require("express");
const cors = require("cors");
const { createClient } = require("@libsql/client");

const app = express();

app.use(cors({
    origin: "*",
    methods: ["POST", "GET"]
}));

app.use(express.json());

// Turso database client
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create tables
async function initDb() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            email TEXT UNIQUE,
            token TEXT UNIQUE
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            api_key TEXT
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS lyns (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            author TEXT,
            google_name TEXT,
            google_email TEXT,
            prompt TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    `);

    console.log("Database tables ready.");
}

// Import routes
require("./createAccount")(app, db);
require("./getKey")(app, db);
require("./modelRouter")(app, db);
require("./lyns")(app, db);

// Cron route
app.get("/cron", async (req, res) => {
    try {
        const result = await db.execute("DELETE FROM api_keys WHERE api_key IS NULL");
        res.json({ success: true, message: `Cron job ran successfully. ${result.rowsAffected} rows affected.` });
    } catch (error) {
        console.error("Cron error:", error);
        res.status(500).json({ success: false, message: "Cron job failed" });
    }
});

initDb().then(() => {
    app.listen(3000, () => {
        console.log("API running on port 3000");
    });
}).catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
});
