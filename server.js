require("dotenv").config();

require("dotenv").config({ path: "./.env" });


const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();


const app = express();


app.use(cors({
    origin: "*",
    methods: ["POST"]
}));

app.use(express.json());

// database
const db = new sqlite3.Database("./database.db");

// create tables
db.run(`
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
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

app.listen(3000, () => {
    console.log("API running on port 3000");
});
