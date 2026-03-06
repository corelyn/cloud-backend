require("dotenv").config({ path: "./.env" });

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();

app.use(cors({
    origin: "*",
    methods: ["POST", "GET"] // Added GET in case /cron is called via GET
}));

app.use(express.json());

// database
const db = new sqlite3.Database("./database.db");

// create tables
db.run(`
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE,
    token TEXT UNIQUE
)
`);


db.run(`
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    api_key TEXT
)
`);

// import routes
require("./createAccount")(app, db);
require("./getKey")(app, db);
require("./modelRouter")(app, db);

// Add /cron route
app.get("/cron", async (req, res) => {
    try {
        // Example: perform a scheduled cleanup or update task
        db.run("DELETE FROM api_keys WHERE api_key IS NULL", function(err) {
            if (err) {
                console.error("Error running cron:", err);
                return res.status(500).json({ success: false, message: "Cron job failed" });
            }
            res.json({ success: true, message: `Cron job ran successfully. ${this.changes} rows affected.` });
        });
    } catch (error) {
        console.error("Cron error:", error);
        res.status(500).json({ success: false, message: "Cron job failed" });
    }
});

app.listen(3000, () => {
    console.log("API running on port 3000");
});
