const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const SQLITE_PATH = path.join(DATA_DIR, "myalbums.sqlite");

let database = null;

function getDatabase() {
  if (database) return database;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  database = new DatabaseSync(SQLITE_PATH);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}

function initDatabase() {
  const db = getDatabase();
  db.exec(SCHEMA_SQL);
  applyMigrations(db);
  return db;
}

function applyMigrations(db) {
  ensureColumn(db, "users", "avatar_url", "TEXT");
  ensureColumn(db, "users", "bio", "TEXT");
  ensureColumn(db, "users", "favorite_genres", "TEXT");
  ensureColumn(db, "users", "favorite_artists", "TEXT");
  ensureColumn(db, "users", "phone", "TEXT");
  ensureColumn(db, "users", "whatsapp", "TEXT");
  ensureColumn(db, "users", "approval_status", "TEXT NOT NULL DEFAULT 'approved'");
  ensureColumn(db, "catalog_albums", "collection_registered_at", "TEXT");
  ensureColumn(db, "articles", "scope", "TEXT NOT NULL DEFAULT 'community'");
  ensureColumn(db, "podcast_episodes", "scope", "TEXT NOT NULL DEFAULT 'community'");
  ensureColumn(db, "bubbles", "cover_url", "TEXT");
  db.exec(COMMUNITY_COMMENTS_SQL);
  db.exec(REVIEW_COMMENTS_SQL);
  db.exec(FRIEND_FAVORITES_SQL);
  db.exec(`
    UPDATE catalog_albums
    SET physical_format = 'Vinil'
    WHERE is_active = 1 AND (physical_format IS NULL OR trim(physical_format) = '');

    UPDATE catalog_albums
    SET collection_status = 'Na coleção'
    WHERE is_active = 1 AND (collection_status IS NULL OR trim(collection_status) = '');

    UPDATE catalog_albums
    SET collection_registered_at = date('now')
    WHERE is_active = 1 AND (collection_registered_at IS NULL OR trim(collection_registered_at) = '');
  `);
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function query(sql, params = {}) {
  return getDatabase().prepare(sql).all(params);
}

function get(sql, params = {}) {
  return getDatabase().prepare(sql).get(params);
}

function run(sql, params = {}) {
  return getDatabase().prepare(sql).run(params);
}

function transaction(callback) {
  const db = getDatabase();
  db.exec("BEGIN;");
  try {
    const result = callback(db);
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

function createId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function closeDatabase() {
  if (!database) return;
  database.close();
  database = null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  avatar_url TEXT,
  bio TEXT,
  favorite_genres TEXT,
  favorite_artists TEXT,
  phone TEXT,
  whatsapp TEXT,
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS catalog_albums (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  spotify_id TEXT,
  album TEXT NOT NULL,
  artist TEXT NOT NULL,
  release_date TEXT,
  release_year INTEGER,
  decade TEXT,
  genre TEXT,
  subgenre TEXT,
  country TEXT,
  label TEXT,
  tracks INTEGER DEFAULT 0,
  duration_min INTEGER DEFAULT 0,
  has_physical TEXT DEFAULT 'Não',
  physical_format TEXT,
  collection_status TEXT,
  collection_registered_at TEXT,
  cover_url TEXT,
  spotify_url TEXT,
  observations TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS listening_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  album_id TEXT NOT NULL,
  listened_at TEXT NOT NULL,
  format TEXT,
  platform TEXT,
  listening_type TEXT,
  genre TEXT,
  subgenre TEXT,
  country TEXT,
  tracks_heard INTEGER DEFAULT 0,
  duration_min INTEGER DEFAULT 0,
  rating REAL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  mood TEXT,
  location TEXT,
  company TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  listen_again INTEGER NOT NULL DEFAULT 1 CHECK (listen_again IN (0, 1)),
  month TEXT,
  listening_year INTEGER,
  week INTEGER,
  observations TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (album_id) REFERENCES catalog_albums(id)
);

CREATE TABLE IF NOT EXISTS news_releases (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  release_date TEXT,
  release_year INTEGER,
  cover_url TEXT,
  total_tracks INTEGER DEFAULT 0,
  external_url TEXT,
  source TEXT NOT NULL DEFAULT 'spotify',
  payload_json TEXT,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE TABLE IF NOT EXISTS community_news_cache (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  author TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  image_url TEXT,
  published_at TEXT,
  payload_json TEXT,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_name, external_id)
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'community',
  summary TEXT,
  content TEXT NOT NULL,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'community',
  summary TEXT,
  description TEXT,
  audio_url TEXT,
  external_url TEXT,
  cover_url TEXT,
  duration_min INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bubbles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'restricted')),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bubble_members (
  id TEXT PRIMARY KEY,
  bubble_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'pending', 'removed', 'blocked')),
  invited_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bubble_id) REFERENCES bubbles(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (invited_by) REFERENCES users(id),
  UNIQUE (bubble_id, user_id)
);

CREATE TABLE IF NOT EXISTS bubble_posts (
  id TEXT PRIMARY KEY,
  bubble_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  album_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bubble_id) REFERENCES bubbles(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (album_id) REFERENCES catalog_albums(id)
);

CREATE TABLE IF NOT EXISTS bubble_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_comment_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES bubble_posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_comment_id) REFERENCES bubble_comments(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_catalog_user ON catalog_albums(user_id);
CREATE INDEX IF NOT EXISTS idx_catalog_spotify ON catalog_albums(user_id, spotify_id);
CREATE INDEX IF NOT EXISTS idx_catalog_active ON catalog_albums(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalog_identity ON catalog_albums(user_id, artist, album, release_year);
CREATE INDEX IF NOT EXISTS idx_catalog_collection_filters ON catalog_albums(user_id, is_active, physical_format, genre, collection_status, release_year, collection_registered_at);
CREATE INDEX IF NOT EXISTS idx_catalog_artist_filter ON catalog_albums(user_id, artist);

CREATE INDEX IF NOT EXISTS idx_logs_user ON listening_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_album ON listening_logs(album_id);
CREATE INDEX IF NOT EXISTS idx_logs_date ON listening_logs(user_id, listened_at);
CREATE INDEX IF NOT EXISTS idx_logs_month ON listening_logs(user_id, month);

CREATE INDEX IF NOT EXISTS idx_news_release_date ON news_releases(release_date);
CREATE INDEX IF NOT EXISTS idx_news_artist ON news_releases(artist);
CREATE INDEX IF NOT EXISTS idx_community_news_published ON community_news_cache(published_at);
CREATE INDEX IF NOT EXISTS idx_community_news_source ON community_news_cache(source_name);

CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_podcast_author ON podcast_episodes(author_id);
CREATE INDEX IF NOT EXISTS idx_podcast_status ON podcast_episodes(status);
CREATE INDEX IF NOT EXISTS idx_podcast_published ON podcast_episodes(published_at);

CREATE INDEX IF NOT EXISTS idx_bubbles_visibility ON bubbles(visibility, status);
CREATE INDEX IF NOT EXISTS idx_bubble_members_user ON bubble_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bubble_members_bubble ON bubble_members(bubble_id, status);
CREATE INDEX IF NOT EXISTS idx_bubble_posts_bubble ON bubble_posts(bubble_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_bubble_comments_post ON bubble_comments(post_id, status, created_at);
`;

const COMMUNITY_COMMENTS_SQL = `
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('article', 'podcast')),
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_comment_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_comment_id) REFERENCES community_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_community_comments_target ON community_comments(target_type, target_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_community_comments_parent ON community_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_user ON community_comments(user_id);
`;

const REVIEW_COMMENTS_SQL = `
CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_comment_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (review_id) REFERENCES listening_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_comment_id) REFERENCES review_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review ON review_comments(review_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_review_comments_parent ON review_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_user ON review_comments(user_id);
`;

const FRIEND_FAVORITES_SQL = `
CREATE TABLE IF NOT EXISTS friend_favorites (
  user_id TEXT NOT NULL,
  friend_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (user_id <> friend_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_favorites_friend ON friend_favorites(friend_user_id);
`;

module.exports = {
  SQLITE_PATH,
  getDatabase,
  initDatabase,
  query,
  get,
  run,
  transaction,
  createId,
  now,
  closeDatabase
};
