require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { Config, Posts, Keywords, resetForNewClient } = require('./database');
const { getAuthUrl, handleCallback, listGBPAccounts, listLocations, isAuthenticated, disconnect } = require('./google');
const { generateKeywords } = require('./ai');
const { startScheduler, triggerGeneration, triggerPublish } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'gbp-autopilot-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────

app.get('/auth/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { userInfo, accounts } = await handleCallback(code);
    req.session.authed = true;
    console.log(`[Auth] Connected: ${userInfo.email}`);
    res.redirect('/?connected=1');
  } catch (err) {
    console.error('[Auth] Callback error:', err.message);
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

app.post('/auth/disconnect', (req, res) => {
  disconnect();
  req.session.destroy();
  res.json({ ok: true });
});

// ─── API ROUTES ──────────────────────────────────────────────────────────────

// Get current app status
app.get('/api/status', (req, res) => {
  const authed = isAuthenticated();
  const user = Config.get('google_user');
  const business = Config.get('business_info');
  const location = Config.get('gbp_location');
  const locationName = Config.get('gbp_location_name');
  const stats = Posts.getStats();
  const kwCount = Keywords.count();

  res.json({
    authenticated: authed,
    user,
    businessConfigured: !!business,
    locationSelected: !!location,
    business,
    locationName,
    stats,
    kwCount,
    setupComplete: authed && !!business && !!location && kwCount > 0,
  });
});

// Get GBP accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await listGBPAccounts(null);
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get locations for an account
app.get('/api/locations/:accountName', async (req, res) => {
  try {
    const locations = await listLocations(decodeURIComponent(req.params.accountName));
    res.json({ locations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save selected GBP location
app.post('/api/location', (req, res) => {
  const { locationName, displayName } = req.body;
  Config.set('gbp_location', locationName);
  Config.set('gbp_location_name', displayName);
  res.json({ ok: true });
});

// Save business info
app.post('/api/business', (req, res) => {
  const { name, category, location, services, audience, usp, website } = req.body;
  Config.set('business_info', { name, category, location, services, audience, usp, website });
  res.json({ ok: true });
});

// Save content style/guidelines
app.post('/api/content-style', (req, res) => {
  const { tone, wordCount, guidelines, includeCta } = req.body;
  Config.set('content_style', { tone, wordCount: parseInt(wordCount), guidelines, includeCta: !!includeCta });
  res.json({ ok: true });
});

// Generate keywords
app.post('/api/keywords/generate', async (req, res) => {
  try {
    const keywords = await generateKeywords();
    res.json({ ok: true, keywords, count: keywords.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all keywords
app.get('/api/keywords', (req, res) => {
  res.json({ keywords: Keywords.getAll() });
});

// Add manual keywords
app.post('/api/keywords/add', (req, res) => {
  const { keywords } = req.body; // array of strings
  Keywords.addMany(keywords);
  res.json({ ok: true, count: Keywords.count() });
});

// Clear and regenerate keywords
app.delete('/api/keywords', (req, res) => {
  Keywords.clear();
  res.json({ ok: true });
});

// Get all posts
app.get('/api/posts', (req, res) => {
  res.json({ posts: Posts.getRecent(50) });
});

// Get pending posts
app.get('/api/posts/pending', (req, res) => {
  res.json({ posts: Posts.getPending() });
});

// Manually generate a new post
app.post('/api/posts/generate', async (req, res) => {
  try {
    const post = await triggerGeneration();
    res.json({ ok: true, post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manually publish next post now (for testing)
app.post('/api/posts/publish-now', async (req, res) => {
  try {
    const post = await triggerPublish();
    res.json({ ok: true, post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset for new client
app.post('/api/reset', (req, res) => {
  resetForNewClient();
  res.json({ ok: true });
});

// ─── FRONTEND ────────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       GBP AUTOPILOT — RUNNING          ║
║   Open: http://localhost:${PORT}          ║
╚════════════════════════════════════════╝
  `);
  startScheduler();
});

module.exports = app;
