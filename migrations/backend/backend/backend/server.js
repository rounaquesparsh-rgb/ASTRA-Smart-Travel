// backend/server.js
// Minimal ASTRA backend: Cloudinary signed uploads, Google OAuth callback, Postgres (knex), calendar sync, contacts CRUD, translate proxy.
// IMPORTANT: fill real secrets in backend/.env (do NOT commit secrets).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const knex = require('knex')({ client: 'pg', connection: process.env.DATABASE_URL });
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: '/tmp/uploads' });
const app = express();
app.use(cors());
app.use(express.json());

// Ensure minimal tables exist (for demo; replace with proper migrations in prod)
async function ensureTables() {
  try {
    const u = await knex.schema.hasTable('users');
    if (!u) {
      await knex.schema.createTable('users', (t) => {
        t.increments('id').primary();
        t.string('email').unique();
        t.string('name');
        t.string('google_refresh_token');
        t.string('google_access_token');
        t.timestamp('created_at').defaultTo(knex.fn.now());
      });
    }
    const c = await knex.schema.hasTable('contacts');
    if (!c) {
      await knex.schema.createTable('contacts', (t) => {
        t.increments('id').primary();
        t.integer('user_id').references('users.id').onDelete('CASCADE');
        t.string('name');
        t.string('phone');
        t.string('email');
        t.timestamp('created_at').defaultTo(knex.fn.now());
      });
    }
  } catch (err) {
    console.error('ensureTables error', err);
  }
}
ensureTables().catch(console.error);

// Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Start OAuth flow
app.get('/auth/google', (req, res) => {
  const state = uuidv4(); // in prod store state server-side
  const scopes = ['https://www.googleapis.com/auth/calendar', 'profile', 'email'];
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes, state });
  res.redirect(url);
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // get user info
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const me = await oauth2.userinfo.get();
    const email = me.data.email;
    const name = me.data.name || '';

    // upsert user
    let user = await knex('users').where({ email }).first();
    if (!user) {
      const [id] = await knex('users')
        .insert({
          email,
          name,
          google_refresh_token: tokens.refresh_token || null,
          google_access_token: tokens.access_token || null,
        })
        .returning('id');
      user = { id, email, name };
    } else {
      await knex('users').where({ id: user.id }).update({
        google_refresh_token: tokens.refresh_token || user.google_refresh_token,
        google_access_token: tokens.access_token,
      });
    }

    // create JWT for client
    const token = jwt.sign({ userId: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    // redirect back to frontend with token (for demo - use secure cookie in prod)
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('auth callback error', err);
    return res.status(500).send('Auth failed');
  }
});

// Simple JWT middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'no auth' });
  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'malformed auth' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// Cloudinary signed upload (client requests signature then uploads directly to Cloudinary)
app.get('/api/upload/sign', authMiddleware, (req, res) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const public_id = `astra/${req.user.userId}/${timestamp}`;
  const paramsToSign = { timestamp, public_id, folder: 'astra' };
  const crypto = require('crypto');
  const toSign = Object.keys(paramsToSign)
    .sort()
    .map((k) => `${k}=${paramsToSign[k]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(toSign + process.env.CLOUDINARY_API_SECRET).digest('hex');
  res.json({ signature, api_key: process.env.CLOUDINARY_API_KEY, timestamp, public_id, cloud_name: process.env.CLOUDINARY_CLOUD_NAME });
});

// Server-side upload fallback (accept file and upload via server)
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const result = await cloudinary.uploader.upload(file.path, { folder: `astra/${req.user.userId}` });
    fs.unlinkSync(file.path);
    return res.json({ url: result.secure_url, raw: result });
  } catch (err) {
    console.error('server upload error', err);
    return res.status(500).json({ error: 'upload failed' });
  }
});

// Helper to build OAuth client for a user using stored refresh token
async function getOAuthClientForUser(userId) {
  const user = await knex('users').where({ id: userId }).first();
  if (!user || !user.google_refresh_token) throw new Error('no google token');
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  client.setCredentials({ refresh_token: user.google_refresh_token });
  // refresh to get access token
  const tokens = await client.getAccessToken();
  client.setCredentials({ access_token: tokens.token, refresh_token: user.google_refresh_token });
  return client;
}

// Calendar sync endpoint (create event)
app.post('/api/calendar/sync', authMiddleware, async (req, res) => {
  try {
    const { action, event } = req.body;
    const client = await getOAuthClientForUser(req.user.userId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    if (action === 'create') {
      const ev = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
      return res.json({ ok: true, event: ev.data });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('calendar sync failed', err);
    return res.status(500).json({ error: 'calendar sync failed' });
  }
});

// Contacts CRUD
app.get('/api/contacts', authMiddleware, async (req, res) => {
  const cs = await knex('contacts').where({ user_id: req.user.userId }).orderBy('created_at', 'desc');
  res.json(cs);
});
app.post('/api/contacts', authMiddleware, async (req, res) => {
  const { name, phone, email } = req.body;
  const [id] = await knex('contacts').insert({ user_id: req.user.userId, name, phone, email }).returning('id');
  const c = await knex('contacts').where({ id }).first();
  res.json(c);
});

// Translate proxy (LibreTranslate by default)
app.post('/api/translate', async (req, res) => {
  try {
    const { text, target } = req.body;
    const resp = await fetch(process.env.LIBRE_URL || 'https://libretranslate.de/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'auto', target: target || 'vi', format: 'text' }),
    });
    const j = await resp.json();
    res.json({ translated: j.translatedText || j.translation || JSON.stringify(j) });
  } catch (err) {
    console.error('translate error', err);
    res.status(500).json({ error: 'translate error' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Backend running on', port));
