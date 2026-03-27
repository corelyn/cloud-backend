const { OAuth2Client } = require('google-auth-library');
const leoProfanity = require('leo-profanity');

const GOOGLE_CLIENT_ID = '1095022231097-m2jpnjm7fkh0k2kd46hca3p4i8b6v3k0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

async function verifyGoogleToken(credential) {
    const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
}

function containsProfanity(...strings) {
    for (const str of strings) {
        if (str && leoProfanity.check(str)) return true;
    }
    return false;
}

module.exports = function (app, db) {

    // GET /lyns — public, email never exposed
    app.get('/lyns', async (req, res) => {
        try {
            const result = await db.execute(
                'SELECT id, title, description, author, google_name, prompt, created_at FROM lyns ORDER BY created_at DESC'
            );
            res.json({ success: true, lyns: result.rows });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Failed to load Lyns' });
        }
    });

    // POST /lyns — requires Google login, only from corelyn.github.io
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

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, message: 'Prompt is required' });
        }

        if (title.length > 60) {
            return res.status(400).json({ success: false, message: 'Title too long (max 60)' });
        }

        if (prompt.length > 8000) {
            return res.status(400).json({ success: false, message: 'Prompt too long (max 8000)' });
        }

        if (containsProfanity(title, desc, author, prompt)) {
            return res.status(400).json({
                success: false,
                message: 'Your submission contains inappropriate language.'
            });
        }

        const lynId = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        const now = createdAt || Date.now();
        const finalAuthor = (author || '').trim() || googleUser.name || '';

        // Check how many Lyns this user already created
        const countResult = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM lyns WHERE google_email = ?',
            args: [googleUser.email]
        });

        const count = Number(countResult.rows[0].count);
        if (count >= 3) {
            return res.status(403).json({
                success: false,
                message: 'You can only create up to 3 Lyns.'
            });
        }

        // INSERT new Lyn
        try {
            await db.execute({
                sql: `INSERT INTO lyns (id, title, description, author, google_name, google_email, prompt, created_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    lynId,
                    title.trim(),
                    (desc || '').trim(),
                    finalAuthor,
                    googleUser.name,
                    googleUser.email,
                    prompt.trim(),
                    now
                ]
            });

            res.json({ success: true, id: lynId });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Failed to save Lyn' });
        }
    });

};
