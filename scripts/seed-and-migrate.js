const fs = require("fs");
const path = require("path");

const {
  initDatabase,
  getDatabase,
  transaction,
  createId,
  now,
  closeDatabase
} = require("../src/database");
const { hashPassword } = require("../src/passwords");

const ROOT = path.join(__dirname, "..");
const DB_JSON_PATH = path.join(ROOT, "data", "db.json");

const ADMIN_USER = {
  id: "user_admin",
  name: "Administrador",
  email: "admin@myalbuns.com",
  passwordHash: process.env.SEED_ADMIN_PASSWORD_HASH
    || "pbkdf2$sha256$210000$wnw_MvSF9UVjkGIoe9cCUw$nuuwnESPhfPKt3r2QwyQzOy1v0GZrFlE3zQknnbTqQU",
  role: "admin"
};

const PRIMARY_USER = {
  id: "user_raphael",
  name: "Raphael",
  email: "usuario@myalbuns.com",
  passwordHash: process.env.SEED_USER_PASSWORD_HASH
    || "pbkdf2$sha256$210000$NCkCoIDpNuuuGqNhQ-Al7Q$-0gBITLnW_j9Cd4kjMTAznVB8O9UrG4u5KMRAaEwUvY",
  role: "user"
};

function main() {
  initDatabase();
  const legacyDb = readLegacyDb();
  const timestamp = now();

  const summary = transaction((db) => {
    seedUser(db, ADMIN_USER, timestamp);
    seedUser(db, PRIMARY_USER, timestamp);

    const albumIdMap = migrateCatalog(db, legacyDb.catalog || [], PRIMARY_USER.id, timestamp);
    const missingAlbums = ensureAlbumsForLogs(
      db,
      legacyDb.listeningLog || [],
      albumIdMap,
      PRIMARY_USER.id,
      timestamp
    );
    const listeningLogs = migrateListeningLogs(
      db,
      legacyDb.listeningLog || [],
      albumIdMap,
      PRIMARY_USER.id,
      timestamp
    );
    migrateLists(db, legacyDb.lists || {}, timestamp);

    return {
      users: 2,
      catalogAlbums: albumIdMap.size,
      listeningLogs,
      placeholderAlbums: missingAlbums
    };
  });

  const integrity = verifyIntegrity();
  closeDatabase();

  process.stdout.write(JSON.stringify({ summary, integrity }, null, 2));
}

function readLegacyDb() {
  if (!fs.existsSync(DB_JSON_PATH)) {
    return { catalog: [], listeningLog: [], lists: {} };
  }
  return JSON.parse(fs.readFileSync(DB_JSON_PATH, "utf8"));
}

function seedUser(db, user, timestamp) {
  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, status,
      avatar_url, bio, favorite_genres, favorite_artists,
      created_at, updated_at, last_login_at
    )
    VALUES (
      :id, :name, :email, :password_hash, :role, 'active',
      NULL, NULL, NULL, NULL,
      :created_at, :updated_at, NULL
    )
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      role = excluded.role,
      status = 'active',
      updated_at = excluded.updated_at
  `).run({
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash || hashPassword(process.env[`SEED_${user.role.toUpperCase()}_PASSWORD`]),
    role: user.role,
    created_at: timestamp,
    updated_at: timestamp
  });
}

function migrateCatalog(db, catalog, userId, timestamp) {
  const albumIdMap = new Map();
  const statement = db.prepare(`
    INSERT INTO catalog_albums (
      id, user_id, spotify_id, album, artist, release_date, release_year,
      decade, genre, subgenre, country, label, tracks, duration_min,
      has_physical, physical_format, collection_status, cover_url,
      spotify_url, observations, is_active, created_at, updated_at
    )
    VALUES (
      :id, :user_id, :spotify_id, :album, :artist, :release_date, :release_year,
      :decade, :genre, :subgenre, :country, :label, :tracks, :duration_min,
      :has_physical, :physical_format, :collection_status, :cover_url,
      :spotify_url, :observations, 1, :created_at, :updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      spotify_id = excluded.spotify_id,
      album = excluded.album,
      artist = excluded.artist,
      release_date = excluded.release_date,
      release_year = excluded.release_year,
      decade = excluded.decade,
      genre = excluded.genre,
      subgenre = excluded.subgenre,
      country = excluded.country,
      label = excluded.label,
      tracks = excluded.tracks,
      duration_min = excluded.duration_min,
      has_physical = excluded.has_physical,
      physical_format = excluded.physical_format,
      collection_status = excluded.collection_status,
      cover_url = excluded.cover_url,
      spotify_url = excluded.spotify_url,
      observations = excluded.observations,
      is_active = 1,
      updated_at = excluded.updated_at
  `);

  for (const item of catalog) {
    const id = clean(item.id) || clean(item.spotifyId) || createId("album");
    albumIdMap.set(clean(item.id) || id, id);

    statement.run({
      id,
      user_id: userId,
      spotify_id: clean(item.spotifyId),
      album: clean(item.album) || "Album sem titulo",
      artist: clean(item.artist) || "Artista desconhecido",
      release_date: clean(item.releaseDate) || releaseDateFromYear(item.releaseYear),
      release_year: numberOrNull(item.releaseYear),
      decade: clean(item.decade) || decadeFromYear(item.releaseYear),
      genre: clean(item.genre),
      subgenre: clean(item.subgenre),
      country: clean(item.country),
      label: clean(item.label),
      tracks: numberOrZero(item.tracks),
      duration_min: numberOrZero(item.durationMin),
      has_physical: clean(item.hasPhysical) || "Nao",
      physical_format: clean(item.physicalFormat),
      collection_status: clean(item.collectionStatus),
      cover_url: clean(item.coverUrl),
      spotify_url: clean(item.spotifyUrl),
      observations: clean(item.observations),
      created_at: timestamp,
      updated_at: timestamp
    });
  }

  return albumIdMap;
}

function ensureAlbumsForLogs(db, logs, albumIdMap, userId, timestamp) {
  const existing = db.prepare("SELECT id FROM catalog_albums WHERE id = :id");
  const insert = db.prepare(`
    INSERT INTO catalog_albums (
      id, user_id, spotify_id, album, artist, release_date, release_year,
      decade, genre, subgenre, country, label, tracks, duration_min,
      has_physical, physical_format, collection_status, cover_url,
      spotify_url, observations, is_active, created_at, updated_at
    )
    VALUES (
      :id, :user_id, NULL, :album, :artist, :release_date, :release_year,
      :decade, :genre, :subgenre, :country, NULL, :tracks, :duration_min,
      'Nao', NULL, NULL, NULL, NULL, 'Criado automaticamente pela migracao do historico.',
      1, :created_at, :updated_at
    )
    ON CONFLICT(id) DO NOTHING
  `);

  let created = 0;
  for (const log of logs) {
    const legacyCatalogId = clean(log.catalogId);
    if (albumIdMap.has(legacyCatalogId)) continue;

    const id = legacyCatalogId || createId("album");
    if (existing.get({ id })) {
      albumIdMap.set(legacyCatalogId || id, id);
      continue;
    }

    insert.run({
      id,
      user_id: userId,
      album: clean(log.album) || "Album sem titulo",
      artist: clean(log.artist) || "Artista desconhecido",
      release_date: releaseDateFromYear(log.releaseYear),
      release_year: numberOrNull(log.releaseYear),
      decade: clean(log.decade) || decadeFromYear(log.releaseYear),
      genre: clean(log.genre),
      subgenre: clean(log.subgenre),
      country: clean(log.country),
      tracks: numberOrZero(log.tracksHeard),
      duration_min: numberOrZero(log.durationMin),
      created_at: timestamp,
      updated_at: timestamp
    });
    albumIdMap.set(legacyCatalogId || id, id);
    created += 1;
  }
  return created;
}

function migrateListeningLogs(db, logs, albumIdMap, userId, timestamp) {
  const statement = db.prepare(`
    INSERT INTO listening_logs (
      id, user_id, album_id, listened_at, format, platform,
      listening_type, genre, subgenre, country, tracks_heard, duration_min,
      rating, mood, location, company, favorite, listen_again,
      month, listening_year, week, observations, created_at, updated_at
    )
    VALUES (
      :id, :user_id, :album_id, :listened_at, :format, :platform,
      :listening_type, :genre, :subgenre, :country, :tracks_heard, :duration_min,
      :rating, :mood, :location, :company, :favorite, :listen_again,
      :month, :listening_year, :week, :observations, :created_at, :updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      album_id = excluded.album_id,
      listened_at = excluded.listened_at,
      format = excluded.format,
      platform = excluded.platform,
      listening_type = excluded.listening_type,
      genre = excluded.genre,
      subgenre = excluded.subgenre,
      country = excluded.country,
      tracks_heard = excluded.tracks_heard,
      duration_min = excluded.duration_min,
      rating = excluded.rating,
      mood = excluded.mood,
      location = excluded.location,
      company = excluded.company,
      favorite = excluded.favorite,
      listen_again = excluded.listen_again,
      month = excluded.month,
      listening_year = excluded.listening_year,
      week = excluded.week,
      observations = excluded.observations,
      updated_at = excluded.updated_at
  `);

  let count = 0;
  for (const log of logs) {
    const legacyCatalogId = clean(log.catalogId);
    const albumId = albumIdMap.get(legacyCatalogId);
    if (!albumId) {
      throw new Error(`Audição sem album vinculado: ${clean(log.id) || "(sem id)"}`);
    }

    statement.run({
      id: clean(log.id) || createId("log"),
      user_id: userId,
      album_id: albumId,
      listened_at: normalizeDate(log.date),
      format: clean(log.format),
      platform: clean(log.platform),
      listening_type: clean(log.listeningType),
      genre: clean(log.genre),
      subgenre: clean(log.subgenre),
      country: clean(log.country),
      tracks_heard: numberOrZero(log.tracksHeard),
      duration_min: numberOrZero(log.durationMin),
      rating: normalizeRating(log.rating),
      mood: clean(log.mood),
      location: clean(log.location),
      company: clean(log.company),
      favorite: yesNoToBoolean(log.favorite),
      listen_again: yesNoToBoolean(log.listenAgain, true),
      month: normalizeMonth(log.month, log.date),
      listening_year: numberOrNull(log.listeningYear) || yearFromDate(log.date),
      week: numberOrNull(log.week),
      observations: clean(log.observations),
      created_at: timestamp,
      updated_at: timestamp
    });
    count += 1;
  }
  return count;
}

function migrateLists(db, lists, timestamp) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('legacy_lists', :value, :updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({
    value: JSON.stringify(lists),
    updated_at: timestamp
  });
}

function verifyIntegrity() {
  const db = getDatabase();
  const row = (sql, params = {}) => db.prepare(sql).get(params);

  return {
    foreignKeys: row("PRAGMA foreign_keys").foreign_keys,
    users: row("SELECT COUNT(*) AS total FROM users").total,
    catalogAlbums: row("SELECT COUNT(*) AS total FROM catalog_albums WHERE user_id = :user_id", {
      user_id: PRIMARY_USER.id
    }).total,
    listeningLogs: row("SELECT COUNT(*) AS total FROM listening_logs WHERE user_id = :user_id", {
      user_id: PRIMARY_USER.id
    }).total,
    orphanListeningLogs: row(`
      SELECT COUNT(*) AS total
      FROM listening_logs logs
      LEFT JOIN catalog_albums albums ON albums.id = logs.album_id
      WHERE albums.id IS NULL
    `).total,
    personalRowsWithoutUser: row(`
      SELECT
        (SELECT COUNT(*) FROM catalog_albums WHERE user_id IS NULL OR user_id = '') +
        (SELECT COUNT(*) FROM listening_logs WHERE user_id IS NULL OR user_id = '') AS total
    `).total,
    ratingsAboveFive: row("SELECT COUNT(*) AS total FROM listening_logs WHERE rating > 5").total
  };
}

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && String(value).trim() !== "" ? number : null;
}

function releaseDateFromYear(year) {
  const value = numberOrNull(year);
  return value ? `${value}-01-01` : null;
}

function decadeFromYear(year) {
  const value = numberOrNull(year);
  return value ? `${Math.floor(value / 10) * 10}s` : "";
}

function normalizeDate(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return now().slice(0, 10);
}

function normalizeMonth(month, date) {
  const text = clean(month);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  return normalizeDate(date).slice(0, 7);
}

function yearFromDate(value) {
  const date = normalizeDate(value);
  return Number(date.slice(0, 4));
}

function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 0;
  if (rating > 5) return Math.min(5, rating / 2);
  return Math.max(0, rating);
}

function yesNoToBoolean(value, defaultValue = false) {
  const text = clean(value).toLowerCase();
  if (!text) return defaultValue ? 1 : 0;
  return text === "sim" ? 1 : 0;
}

main();
