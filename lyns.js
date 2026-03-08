module.exports = function (app, db) {

  // Create table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS lyns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      author TEXT,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // GET /lyns — return all Lyns, newest first
  app.get("/lyns", (req, res) => {
    db.all(
      "SELECT * FROM lyns ORDER BY created_at DESC",
      [],
      (err, rows) => {
        if (err) {
          console.error("GET /lyns error:", err);
          return res.status(500).json({ success: false, message: "Failed to load Lyns" });
        }
        res.json({ success: true, lyns: rows });
      }
    );
  });

  // POST /lyns — submit a new Lyn (only from corelyn.github.io)
  app.post("/lyns", (req, res) => {
    const origin = req.headers.origin || req.headers.referer || '';
    if (!origin.startsWith('https://corelyn.github.io')) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const { id, title, desc, author, prompt, createdAt } = req.body;

    if (!title || !title.trim())  return res.status(400).json({ success: false, message: "Title is required" });
    if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, message: "Prompt is required" });
    if (title.length  > 60)   return res.status(400).json({ success: false, message: "Title too long (max 60)" });
    if (prompt.length > 8000) return res.status(400).json({ success: false, message: "Prompt too long (max 8000)" });

    const lynId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const now   = createdAt || Date.now();

    db.run(
      `INSERT INTO lyns (id, title, description, author, prompt, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lynId, title.trim(), (desc || '').trim(), (author || '').trim(), prompt.trim(), now],
      function (err) {
        if (err) {
          console.error("POST /lyns error:", err);
          return res.status(500).json({ success: false, message: "Failed to save Lyn" });
        }
        res.json({ success: true, id: lynId });
      }
    );
  });

};
