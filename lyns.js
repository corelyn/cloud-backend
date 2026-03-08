const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = '1095022231097-m2jpnjm7fkh0k2kd46hca3p4i8b6v3k0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

async function verifyGoogleToken(credential) {
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // { email, name, picture, ... }
}

module.exports = function (app, db) {

  db.run(`
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

  // GET /lyns — public, email never exposed
  app.get('/lyns', (req, res) => {
    db.all(
      'SELECT id, title, description, author, google_name, prompt, created_at FROM lyns ORDER BY created_at DESC',
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to load Lyns' });
        res.json({ success: true, lyns: rows });
      }
    );
  });

  // POST /lyns — requires valid Google credential, only from corelyn.github.io
  app.post('/lyns', async (req, res) => {
    const origin = req.headers.origin || req.headers.referer || '';
    if (!origin.startsWith('https://corelyn.github.io')) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { id, title, desc, author, prompt, createdAt, credential } = req.body;

    if (!credential) {
      return res.status(401).json({ success: false, message: 'Sign in with Google to submit a Lyn' });
    }

    let googleUser;
    try {
      googleUser = await verifyGoogleToken(credential);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Google sign-in failed: ' + e.message });
    }

    if (!title || !title.trim())   return res.status(400).json({ success: false, message: 'Title is required' });
    if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, message: 'Prompt is required' });
    if (title.length  > 60)        return res.status(400).json({ success: false, message: 'Title too long (max 60)' });
    if (prompt.length > 8000)      return res.status(400).json({ success: false, message: 'Prompt too long (max 8000)' });

    const lynId       = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const now         = createdAt || Date.now();
    const finalAuthor = (author || '').trim() || googleUser.name || '';

    db.run(
      `INSERT INTO lyns (id, title, description, author, google_name, google_email, prompt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [lynId, title.trim(), (desc || '').trim(), finalAuthor, googleUser.name, googleUser.email, prompt.trim(), now],
      function (err) {
        if (err) return res.status(500).json({ success: false, message: 'Failed to save Lyn' });
        res.json({ success: true, id: lynId });
      }
    );
  });

};
