const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/autopilot.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    status        TEXT NOT NULL DEFAULT 'pending',
    keyword       TEXT,
    title         TEXT,
    body          TEXT,
    cta_text      TEXT,
    cta_url       TEXT,
    image_prompt  TEXT,
    scheduled_for TEXT,
    posted_at     TEXT,
    gbp_post_id   TEXT,
    error_msg     TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS keywords (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword    TEXT NOT NULL UNIQUE,
    used_count INTEGER DEFAULT 0,
    last_used  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Config helpers
const Config = {
  get: (key) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  },
  set: (key, value) => {
    const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, val);
  },
  delete: (key) => {
    db.prepare('DELETE FROM config WHERE key = ?').run(key);
  },
  all: () => {
    const rows = db.prepare('SELECT key, value FROM config').all();
    const result = {};
    rows.forEach(r => {
      try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; }
    });
    return result;
  }
};

// Posts helpers
const Posts = {
  add: (post) => {
    return db.prepare(`
      INSERT INTO posts (status, keyword, title, body, cta_text, cta_url, image_prompt, scheduled_for)
      VALUES (@status, @keyword, @title, @body, @cta_text, @cta_url, @image_prompt, @scheduled_for)
    `).run(post);
  },
  getPending: () => {
    return db.prepare(`SELECT * FROM posts WHERE status = 'pending' ORDER BY scheduled_for ASC`).all();
  },
  getDue: () => {
    return db.prepare(`
      SELECT * FROM posts WHERE status = 'pending' AND scheduled_for <= datetime('now')
      ORDER BY scheduled_for ASC LIMIT 1
    `).get();
  },
  markPosted: (id, gbpPostId) => {
    db.prepare(`UPDATE posts SET status='posted', posted_at=datetime('now'), gbp_post_id=? WHERE id=?`).run(gbpPostId, id);
  },
  markFailed: (id, errorMsg) => {
    db.prepare(`UPDATE posts SET status='failed', error_msg=? WHERE id=?`).run(errorMsg, id);
  },
  getRecent: (limit = 20) => {
    return db.prepare(`SELECT * FROM posts ORDER BY created_at DESC LIMIT ?`).all(limit);
  },
  getStats: () => {
    return {
      total:   db.prepare(`SELECT COUNT(*) as c FROM posts`).get().c,
      posted:  db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status='posted'`).get().c,
      pending: db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status='pending'`).get().c,
      failed:  db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status='failed'`).get().c,
    };
  }
};

// Keywords helpers
const Keywords = {
  addMany: (kwList) => {
    const insert = db.prepare(`INSERT OR IGNORE INTO keywords (keyword) VALUES (?)`);
    const insertMany = db.transaction((list) => list.forEach(k => insert.run(k.trim())));
    insertMany(kwList);
  },
  getAll: () => db.prepare(`SELECT * FROM keywords ORDER BY used_count ASC, created_at ASC`).all(),
  getLeastUsed: () => db.prepare(`SELECT * FROM keywords ORDER BY used_count ASC, RANDOM() LIMIT 1`).get(),
  markUsed: (id) => {
    db.prepare(`UPDATE keywords SET used_count = used_count + 1, last_used = datetime('now') WHERE id = ?`).run(id);
  },
  clear: () => db.prepare(`DELETE FROM keywords`).run(),
  count: () => db.prepare(`SELECT COUNT(*) as c FROM keywords`).get().c,
};

// Full reset for new client
const resetForNewClient = () => {
  db.exec(`
    DELETE FROM config WHERE key NOT IN ('app_version');
    DELETE FROM posts;
    DELETE FROM keywords;
  `);
};

module.exports = { db, Config, Posts, Keywords, resetForNewClient };
