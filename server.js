const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { getDatabase, initDatabase, createId, now } = require("./src/database");
const { hashPassword, verifyPassword } = require("./src/passwords");

loadDotEnv();
initDatabase();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = path.join(ROOT, "data", "db.json");
const NEWS_CACHE_PATH = path.join(ROOT, "data", "news-cache.json");
const SESSION_COOKIE = "myalbuns_session";
const SESSION_DAYS = 7;
const NEWS_REFRESH_COOLDOWN_MS = 90 * 1000;
const TMDQA_RSS_URL = "https://www.tenhomaisdiscosqueamigos.com/feed/";
const TMDQA_SOURCE_NAME = "Tenho Mais Discos Que Amigos!";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

let spotifyToken = null;
const newsReleaseCache = new Map();
const NEWS_RELEASE_CACHE_MS = 30 * 60 * 1000;
let newsRefreshInFlight = false;
let spotifyRateLimitedUntil = 0;

const NEWS_ARTISTS = [
  "The Beatles", "The Rolling Stones", "Led Zeppelin", "Pink Floyd", "Queen", "The Who", "AC/DC", "Aerosmith",
  "Black Sabbath", "Deep Purple", "The Doors", "Jimi Hendrix", "Van Halen", "The Eagles", "Lynyrd Skynyrd",
  "Creedence Clearwater Revival", "Fleetwood Mac", "Bruce Springsteen", "David Bowie", "Bob Dylan", "Elton John",
  "Eric Clapton", "Janis Joplin", "Neil Young", "ZZ Top", "Kiss", "Raul Seixas", "Os Mutantes", "Rita Lee",
  "Titãs", "Barão Vermelho", "Legião Urbana", "Capital Inicial", "Engenheiros do Hawaii", "Ultraje a Rigor",
  "Secos & Molhados", "Rush", "The Velvet Underground", "Yes", "Genesis", "Weezer", "Talking Heads", "Radiohead",
  "Ween", "Modest Mouse", "Spoon", "Blur", "Coheed and Cambria", "Steely Dan", "King Gizzard and The Lizard Wizard",
  "The Flaming Lips", "The Beach Boys", "The Strokes", "Arctic Monkeys", "The National", "Coldplay", "Oasis",
  "King Crimson", "Can", "Swans", "The Jimi Hendrix Experience", "The Jesus Lizard", "The Butthole Surfers",
  "Thin Lizzy", "Cream", "The White Stripes", "My Bloody Valentine", "Slint", "The Ramones", "Bad Religion",
  "Nirvana", "Minor Threat", "X", "Television", "The Smiths", "Joy Division", "Green Day", "Death", "MC5",
  "Husker Dü", "Black Flag", "Dead Kennedys", "Bad Brains", "Operation Ivy", "The Cramps", "Iggy Pop and The Stooges",
  "The New York Dolls", "The Misfits", "Samhain", "Germs", "The Distillers", "The Police", "The Damned",
  "Negative Approach", "Box Car Racer", "Sex Pistols", "The Heartbreakers", "Gorilla Biscuits", "Rites of Spring",
  "Big Black", "Fugazi", "Bikini Kill", "Embrace", "Drive Like Jehu", "Descendents", "Minutemen", "Crass", "Fear",
  "Metallica", "Slayer", "Immortal", "Anthrax", "Iron Maiden", "Judas Priest", "W.A.S.P.", "Darkthrone", "Dokken",
  "Motörhead", "Disturbed", "Dream Theater", "Helloween", "Emperor", "Danzig", "System of a Down", "Mayhem",
  "Faith No More", "Tool", "Sabaton", "Sodom", "Twisted Sister", "Opeth", "Deicide", "Godsmack", "Iced Earth",
  "Mercyful Fate", "Ghost", "Type O Negative", "Virgin Steele", "Candlemass", "Razor", "Manilla Road",
  "Lizzy Borden", "Morbid Angel", "Cannibal Corpse", "Bathory"
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.publicMessage || "Erro interno no servidor." });
  }
});

server.listen(PORT, () => {
  console.log(`Sistema Álbuns Música rodando em http://localhost:${PORT}`);
});

async function handleApi(req, res, url) {
  if (url.pathname.startsWith("/api/auth/")) {
    await handleAuthApi(req, res, url);
    return;
  }

  const auth = requireAuth(req, res);
  if (!auth) return;
  req.user = auth.user;

  if (req.method === "GET" && url.pathname === "/api/db") {
    sendJson(res, 200, readUserDb(req.user.id));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/spotify/status") {
    sendJson(res, 200, {
      configured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
    });
    return;
  }

  if (url.pathname === "/api/profile") {
    await handleProfileApi(req, res);
    return;
  }

  if (url.pathname === "/api/profile/articles" || url.pathname.startsWith("/api/profile/articles/")) {
    await handleProfileArticlesApi(req, res, url);
    return;
  }

  if (url.pathname === "/api/profile/podcasts" || url.pathname.startsWith("/api/profile/podcasts/")) {
    await handleProfilePodcastsApi(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/spotify/search") {
    const artist = url.searchParams.get("artist") || "";
    const album = url.searchParams.get("album") || "";
    const query = buildSpotifyQuery({ artist, album, fallback: url.searchParams.get("q") || "" });
    if (!query.trim()) {
      sendJson(res, 400, { error: "Informe artista, album ou os dois campos." });
      return;
    }
    const results = await spotifySearch(query);
    sendJson(res, 200, { results });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/spotify/new-releases") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 12), 1), 20);
    const cursor = Math.max(Number(url.searchParams.get("cursor") || 0), 0);
    sendJson(res, 200, readNewsReleases({ limit, cursor }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/news/releases") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 12), 1), 20);
    const cursor = Math.max(Number(url.searchParams.get("cursor") || 0), 0);
    sendJson(res, 200, readCommunityNews({ limit, cursor }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/news/releases/refresh") {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 12), 1), 20);
    const cursor = Math.max(Number(url.searchParams.get("cursor") || 0), 0);
    const data = await refreshCommunityNews({ limit, cursor });
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === "/api/articles" || url.pathname.startsWith("/api/articles/")) {
    await handleArticlesApi(req, res, url);
    return;
  }

  if (url.pathname === "/api/podcasts" || url.pathname.startsWith("/api/podcasts/")) {
    await handlePodcastsApi(req, res, url);
    return;
  }

  if (url.pathname === "/api/bubbles" || url.pathname.startsWith("/api/bubbles/")) {
    await handleBubblesApi(req, res, url);
    return;
  }

  if (url.pathname.startsWith("/api/reviews/")) {
    await handleReviewCommentsApi(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mydearfriends") {
    sendJson(res, 200, { users: listPublicUsers(req.user.id) });
    return;
  }

  if (url.pathname.startsWith("/api/mydearfriends/")) {
    const friendUserId = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (req.method === "PUT") {
      setFriendFavorite(req.user.id, friendUserId, true);
      sendJson(res, 200, { users: listPublicUsers(req.user.id) });
      return;
    }
    if (req.method === "DELETE") {
      setFriendFavorite(req.user.id, friendUserId, false);
      sendJson(res, 200, { users: listPublicUsers(req.user.id) });
      return;
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/profiles/")) {
    const userId = decodeURIComponent(url.pathname.split("/").pop() || "");
    const profile = readPublicProfile(userId, req.user);
    if (!profile) {
      sendJson(res, 404, { error: "Perfil nao encontrado." });
      return;
    }
    sendJson(res, 200, { profile });
    return;
  }

  if (url.pathname === "/api/users" || url.pathname.startsWith("/api/users/")) {
    if (!requireAdmin(req, res)) return;
    await handleUsersApi(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/catalog") {
    const payload = await readBody(req);
    const item = saveCatalogAlbum(req.user.id, payload);
    sendJson(res, 200, { item, db: readUserDb(req.user.id) });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/catalog/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    softDeleteCatalogAlbum(req.user.id, id);
    sendJson(res, 200, { db: readUserDb(req.user.id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/log") {
    const payload = await readBody(req);
    const item = saveListeningLog(req.user.id, payload);
    sendJson(res, 200, { item, db: readUserDb(req.user.id) });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/log/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    deleteListeningLog(req.user.id, id);
    sendJson(res, 200, { db: readUserDb(req.user.id) });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/lists") {
    if (!requireAdmin(req, res)) return;
    const payload = await readBody(req);
    saveLists(payload);
    sendJson(res, 200, { db: readUserDb(req.user.id) });
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
}

async function handleReviewCommentsApi(req, res, url) {
  const db = getDatabase();
  const parts = url.pathname.split("/").filter(Boolean);
  const reviewId = decodeURIComponent(parts[2] || "");
  const action = parts[3] || "";
  const commentId = decodeURIComponent(parts[4] || "");

  if (action !== "comments" || !reviewId) {
    sendJson(res, 404, { error: "Rota de review nao encontrada." });
    return;
  }

  const review = db.prepare(`
    SELECT id
    FROM listening_logs
    WHERE id = :id
      AND COALESCE(observations, '') <> ''
  `).get({ id: reviewId });

  if (!review) {
    sendJson(res, 404, { error: "Review nao encontrado." });
    return;
  }

  if (req.method === "GET" && parts.length === 4) {
    sendJson(res, 200, { comments: listReviewComments(reviewId, req.user.role === "admin") });
    return;
  }

  if (req.method === "POST" && parts.length === 4) {
    createReviewComment(db, reviewId, await readBody(req), req.user);
    sendJson(res, 200, { comments: listReviewComments(reviewId, req.user.role === "admin") });
    return;
  }

  if (req.method === "PATCH" && parts.length === 5) {
    if (!requireAdmin(req, res)) return;
    moderateReviewComment(db, reviewId, commentId, await readBody(req));
    sendJson(res, 200, { comments: listReviewComments(reviewId, true) });
    return;
  }

  sendJson(res, 404, { error: "Rota de comentario nao encontrada." });
}

async function handleArticlesApi(req, res, url) {
  const db = getDatabase();
  const parts = url.pathname.split("/").filter(Boolean);
  const slugOrId = decodeURIComponent(parts[2] || "");
  const action = parts[3] || "";
  const commentId = decodeURIComponent(parts[4] || "");
  const isCollection = url.pathname === "/api/articles";

  if (req.method === "GET" && isCollection) {
    sendJson(res, 200, { articles: listArticlesForUser(req.user) });
    return;
  }

  if (action === "comments" && slugOrId) {
    const target = resolveArticleTarget(slugOrId, req.user);
    if (!target) {
      sendJson(res, 404, { error: "Artigo nao encontrado." });
      return;
    }
    if (req.method === "GET" && parts.length === 4) {
      sendJson(res, 200, { comments: listCommunityComments("article", target.id) });
      return;
    }
    if (req.method === "POST" && parts.length === 4) {
      const payload = await readBody(req);
      createCommunityComment(db, "article", target.id, payload, req.user);
      sendJson(res, 200, { comments: listCommunityComments("article", target.id) });
      return;
    }
    if (req.method === "PATCH" && parts.length === 5) {
      if (!canModerateContent(req.user, target)) {
        sendJson(res, 403, { error: "Acesso restrito ao autor do conteudo ou administrador." });
        return;
      }
      moderateCommunityComment(db, "article", target.id, commentId, await readBody(req));
      sendJson(res, 200, { comments: listCommunityComments("article", target.id, true) });
      return;
    }
  }

  if (req.method === "GET" && !isCollection) {
    const article = getArticleForUser(slugOrId, req.user);
    if (!article) {
      sendJson(res, 404, { error: "Artigo nao encontrado." });
      return;
    }
    sendJson(res, 200, { article });
    return;
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === "POST" && isCollection) {
    const payload = await readBody(req);
    const article = createArticle(db, req.user.id, payload);
    sendJson(res, 200, { article, articles: listArticlesForUser(req.user) });
    return;
  }

  if (req.method === "PUT" && !isCollection) {
    const payload = await readBody(req);
    const article = updateArticle(db, slugOrId, payload);
    if (!article) {
      sendJson(res, 404, { error: "Artigo nao encontrado." });
      return;
    }
    sendJson(res, 200, { article, articles: listArticlesForUser(req.user) });
    return;
  }

  if (req.method === "DELETE" && !isCollection) {
    db.prepare("DELETE FROM articles WHERE id = :id").run({ id: slugOrId });
    sendJson(res, 200, { articles: listArticlesForUser(req.user) });
    return;
  }

  sendJson(res, 404, { error: "Rota nao encontrada." });
}

async function handlePodcastsApi(req, res, url) {
  const db = getDatabase();
  const parts = url.pathname.split("/").filter(Boolean);
  const slugOrId = decodeURIComponent(parts[2] || "");
  const action = parts[3] || "";
  const commentId = decodeURIComponent(parts[4] || "");
  const isCollection = url.pathname === "/api/podcasts";

  if (req.method === "GET" && action === "audio") {
    await streamPodcastAudio(req, res, slugOrId, req.user);
    return;
  }

  if (action === "comments" && slugOrId) {
    const target = resolvePodcastTarget(slugOrId, req.user);
    if (!target) {
      sendJson(res, 404, { error: "Episodio nao encontrado." });
      return;
    }
    if (req.method === "GET" && parts.length === 4) {
      sendJson(res, 200, { comments: listCommunityComments("podcast", target.id) });
      return;
    }
    if (req.method === "POST" && parts.length === 4) {
      const payload = await readBody(req);
      createCommunityComment(db, "podcast", target.id, payload, req.user);
      sendJson(res, 200, { comments: listCommunityComments("podcast", target.id) });
      return;
    }
    if (req.method === "PATCH" && parts.length === 5) {
      if (!canModerateContent(req.user, target)) {
        sendJson(res, 403, { error: "Acesso restrito ao autor do conteudo ou administrador." });
        return;
      }
      moderateCommunityComment(db, "podcast", target.id, commentId, await readBody(req));
      sendJson(res, 200, { comments: listCommunityComments("podcast", target.id, true) });
      return;
    }
  }

  if (req.method === "GET" && isCollection) {
    sendJson(res, 200, { episodes: listPodcastEpisodesForUser(req.user) });
    return;
  }

  if (req.method === "GET" && !isCollection) {
    const episode = getPodcastEpisodeForUser(slugOrId, req.user);
    if (!episode) {
      sendJson(res, 404, { error: "Episodio nao encontrado." });
      return;
    }
    sendJson(res, 200, { episode });
    return;
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === "POST" && isCollection) {
    const payload = await readBody(req);
    const episode = createPodcastEpisode(db, req.user.id, payload);
    sendJson(res, 200, { episode, episodes: listPodcastEpisodesForUser(req.user) });
    return;
  }

  if (req.method === "PUT" && !isCollection) {
    const payload = await readBody(req);
    const episode = updatePodcastEpisode(db, slugOrId, payload);
    if (!episode) {
      sendJson(res, 404, { error: "Episodio nao encontrado." });
      return;
    }
    sendJson(res, 200, { episode, episodes: listPodcastEpisodesForUser(req.user) });
    return;
  }

  if (req.method === "DELETE" && !isCollection) {
    db.prepare("DELETE FROM podcast_episodes WHERE id = :id").run({ id: slugOrId });
    sendJson(res, 200, { episodes: listPodcastEpisodesForUser(req.user) });
    return;
  }

  sendJson(res, 404, { error: "Rota nao encontrada." });
}

async function handleBubblesApi(req, res, url) {
  const db = getDatabase();
  const parts = url.pathname.split("/").filter(Boolean);
  const bubbleId = decodeURIComponent(parts[2] || "");
  const action = parts[3] || "";
  const postId = decodeURIComponent(parts[4] || "");
  const postAction = parts[5] || "";

  if (req.method === "GET" && url.pathname === "/api/bubbles") {
    sendJson(res, 200, { bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bubbles") {
    const payload = await readBody(req);
    const bubble = createBubble(db, req.user, payload);
    sendJson(res, 200, { bubble, bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (!bubbleId) {
    sendJson(res, 404, { error: "Bubble nao encontrada." });
    return;
  }

  if (req.method === "GET" && parts.length === 3) {
    const detail = getBubbleDetailForUser(bubbleId, req.user);
    if (!detail) {
      sendJson(res, 404, { error: "Bubble nao encontrada ou indisponivel." });
      return;
    }
    sendJson(res, 200, { bubble: detail });
    return;
  }

  if (req.method === "PUT" && parts.length === 3) {
    const payload = await readBody(req);
    const detail = updateBubble(db, bubbleId, payload, req.user);
    sendJson(res, 200, { bubble: detail, bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (req.method === "POST" && action === "join" && parts.length === 4) {
    const detail = requestBubbleJoin(db, bubbleId, req.user);
    sendJson(res, 200, { bubble: detail, bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (req.method === "POST" && action === "invite" && parts.length === 4) {
    if (!canManageBubble(bubbleId, req.user)) {
      sendJson(res, 403, { error: "Apenas admin, owner ou moderador pode convidar usuarios." });
      return;
    }
    const payload = await readBody(req);
    const detail = inviteBubbleMember(db, bubbleId, payload, req.user);
    sendJson(res, 200, { bubble: detail, bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (req.method === "PATCH" && action === "archive" && parts.length === 4) {
    const detail = archiveBubble(db, bubbleId, req.user);
    sendJson(res, 200, { bubble: detail, bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (req.method === "PATCH" && action === "members" && parts.length === 5) {
    const memberId = decodeURIComponent(parts[4] || "");
    const payload = await readBody(req);
    const detail = moderateBubbleMember(db, bubbleId, memberId, payload, req.user);
    sendJson(res, 200, { bubble: detail, bubbles: listVisibleBubbles(req.user) });
    return;
  }

  if (req.method === "POST" && action === "posts" && parts.length === 4) {
    const payload = await readBody(req);
    const detail = createBubblePost(db, bubbleId, payload, req.user);
    sendJson(res, 200, { bubble: detail });
    return;
  }

  if (req.method === "PATCH" && action === "posts" && parts.length === 5) {
    const payload = await readBody(req);
    const detail = moderateBubblePost(db, bubbleId, postId, payload, req.user);
    sendJson(res, 200, { bubble: detail });
    return;
  }

  if (req.method === "POST" && action === "posts" && postAction === "comments" && parts.length === 6) {
    const payload = await readBody(req);
    const detail = createBubbleComment(db, bubbleId, postId, payload, req.user);
    sendJson(res, 200, { bubble: detail });
    return;
  }

  if (req.method === "PATCH" && action === "posts" && postAction === "comments" && parts.length === 7) {
    const commentId = decodeURIComponent(parts[6] || "");
    const payload = await readBody(req);
    const detail = moderateBubbleComment(db, bubbleId, postId, commentId, payload, req.user);
    sendJson(res, 200, { bubble: detail });
    return;
  }

  sendJson(res, 404, { error: "Rota nao encontrada." });
}

async function handleProfileApi(req, res) {
  const db = getDatabase();

  if (req.method === "GET") {
    sendJson(res, 200, { user: publicUser(req.user) });
    return;
  }

  if (req.method !== "PUT") {
    sendJson(res, 404, { error: "Rota nao encontrada." });
    return;
  }

  const payload = await readBody(req);
  const profile = normalizeProfilePayload(payload);
  const current = db.prepare("SELECT * FROM users WHERE id = :id").get({ id: req.user.id });
  if (!current) {
    sendJson(res, 404, { error: "Usuario nao encontrado." });
    return;
  }

  assertEmailAvailable(db, profile.email, req.user.id);

  const params = {
    id: req.user.id,
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatarUrl,
    bio: profile.bio,
    updated_at: now()
  };

  if (profile.password) {
    if (!verifyPassword(profile.currentPassword, current.password_hash)) {
      sendJson(res, 400, { error: "Informe a senha atual correta para alterar a senha." });
      return;
    }
    db.prepare(`
      UPDATE users
      SET name = :name,
          email = :email,
          avatar_url = :avatar_url,
          bio = :bio,
          password_hash = :password_hash,
          updated_at = :updated_at
      WHERE id = :id
    `).run({ ...params, password_hash: hashPassword(profile.password) });
  } else {
    db.prepare(`
      UPDATE users
      SET name = :name,
          email = :email,
          avatar_url = :avatar_url,
          bio = :bio,
          updated_at = :updated_at
      WHERE id = :id
    `).run(params);
  }

  const updated = db.prepare("SELECT * FROM users WHERE id = :id").get({ id: req.user.id });
  sendJson(res, 200, { user: publicUser(updated) });
}

async function handleProfileArticlesApi(req, res, url) {
  const db = getDatabase();
  const parts = url.pathname.split("/").filter(Boolean);
  const articleId = decodeURIComponent(parts[3] || "");
  const isCollection = url.pathname === "/api/profile/articles";

  if (req.method === "GET" && isCollection) {
    sendJson(res, 200, { articles: listProfileArticles(req.user.id, req.user) });
    return;
  }

  if (req.method === "POST" && isCollection) {
    const article = createArticle(db, req.user.id, await readBody(req), "profile");
    sendJson(res, 200, { article, articles: listProfileArticles(req.user.id, req.user) });
    return;
  }

  if (req.method === "PUT" && articleId) {
    const current = db.prepare("SELECT id, author_id, scope FROM articles WHERE id = :id").get({ id: articleId });
    if (!current || current.scope !== "profile") {
      sendJson(res, 404, { error: "Artigo nao encontrado." });
      return;
    }
    if (current.author_id !== req.user.id && req.user.role !== "admin") {
      sendJson(res, 403, { error: "Voce so pode editar seus proprios artigos." });
      return;
    }
    const article = updateArticle(db, articleId, await readBody(req));
    sendJson(res, 200, { article, articles: listProfileArticles(req.user.id, req.user) });
    return;
  }

  if (req.method === "DELETE" && articleId) {
    const current = db.prepare("SELECT id, author_id, scope FROM articles WHERE id = :id").get({ id: articleId });
    if (!current || current.scope !== "profile") {
      sendJson(res, 404, { error: "Artigo nao encontrado." });
      return;
    }
    if (current.author_id !== req.user.id && req.user.role !== "admin") {
      sendJson(res, 403, { error: "Voce so pode excluir seus proprios artigos." });
      return;
    }
    db.prepare("DELETE FROM articles WHERE id = :id").run({ id: articleId });
    sendJson(res, 200, { articles: listProfileArticles(req.user.id, req.user) });
    return;
  }

  sendJson(res, 404, { error: "Rota nao encontrada." });
}

async function handleProfilePodcastsApi(req, res, url) {
  const db = getDatabase();
  const parts = url.pathname.split("/").filter(Boolean);
  const episodeId = decodeURIComponent(parts[3] || "");
  const isCollection = url.pathname === "/api/profile/podcasts";

  if (req.method === "GET" && isCollection) {
    sendJson(res, 200, { episodes: listProfilePodcasts(req.user.id, req.user) });
    return;
  }

  if (req.method === "POST" && isCollection) {
    const episode = createPodcastEpisode(db, req.user.id, await readBody(req), "profile");
    sendJson(res, 200, { episode, episodes: listProfilePodcasts(req.user.id, req.user) });
    return;
  }

  if (req.method === "PUT" && episodeId) {
    const current = db.prepare("SELECT id, author_id, scope FROM podcast_episodes WHERE id = :id").get({ id: episodeId });
    if (!current || current.scope !== "profile") {
      sendJson(res, 404, { error: "Episodio nao encontrado." });
      return;
    }
    if (current.author_id !== req.user.id && req.user.role !== "admin") {
      sendJson(res, 403, { error: "Voce so pode editar seus proprios podcasts." });
      return;
    }
    const episode = updatePodcastEpisode(db, episodeId, await readBody(req));
    sendJson(res, 200, { episode, episodes: listProfilePodcasts(req.user.id, req.user) });
    return;
  }

  if (req.method === "DELETE" && episodeId) {
    const current = db.prepare("SELECT id, author_id, scope FROM podcast_episodes WHERE id = :id").get({ id: episodeId });
    if (!current || current.scope !== "profile") {
      sendJson(res, 404, { error: "Episodio nao encontrado." });
      return;
    }
    if (current.author_id !== req.user.id && req.user.role !== "admin") {
      sendJson(res, 403, { error: "Voce so pode excluir seus proprios podcasts." });
      return;
    }
    db.prepare("DELETE FROM podcast_episodes WHERE id = :id").run({ id: episodeId });
    sendJson(res, 200, { episodes: listProfilePodcasts(req.user.id, req.user) });
    return;
  }

  sendJson(res, 404, { error: "Rota nao encontrada." });
}

async function handleUsersApi(req, res, url) {
  const db = getDatabase();

  if (req.method === "GET" && url.pathname === "/api/users") {
    const users = db.prepare(`
      SELECT id, name, email, role, status, created_at, updated_at, last_login_at
      FROM users
      ORDER BY role, name
    `).all().map(publicUser);
    sendJson(res, 200, { users });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const payload = await readBody(req);
    const user = normalizeUserPayload(payload, true);
    const timestamp = now();
    assertEmailAvailable(db, user.email);
    db.prepare(`
      INSERT INTO users (
        id, name, email, password_hash, role, status,
        avatar_url, bio, favorite_genres, favorite_artists,
        created_at, updated_at, last_login_at
      )
      VALUES (
        :id, :name, :email, :password_hash, :role, :status,
        NULL, :bio, NULL, NULL,
        :created_at, :updated_at, NULL
      )
    `).run({
      id: createId("user"),
      name: user.name,
      email: user.email,
      password_hash: hashPassword(user.password),
      role: user.role,
      status: user.status,
      bio: user.bio,
      created_at: timestamp,
      updated_at: timestamp
    });
    sendJson(res, 200, { users: listUsers(db) });
    return;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(pathParts[2] || "");
  const existing = db.prepare("SELECT * FROM users WHERE id = :id").get({ id });
  if (!existing) {
    sendJson(res, 404, { error: "Usuário não encontrado." });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/users/")) {
    const payload = await readBody(req);
    const user = normalizeUserPayload(payload, false);
    const timestamp = now();
    assertEmailAvailable(db, user.email, id);
    const params = {
      id,
      name: user.name || existing.name,
      email: user.email || existing.email,
      role: user.role || existing.role,
      status: user.status || existing.status,
      bio: user.bio,
      updated_at: timestamp
    };

    if (user.password) {
      db.prepare(`
        UPDATE users
        SET name = :name, email = :email, password_hash = :password_hash,
            role = :role, status = :status, bio = :bio, updated_at = :updated_at
        WHERE id = :id
      `).run({ ...params, password_hash: hashPassword(user.password) });
    } else {
      db.prepare(`
        UPDATE users
        SET name = :name, email = :email, role = :role,
            status = :status, bio = :bio, updated_at = :updated_at
        WHERE id = :id
      `).run(params);
    }

    sendJson(res, 200, { users: listUsers(db) });
    return;
  }

  if (req.method === "PATCH" && url.pathname.endsWith("/status")) {
    const payload = await readBody(req);
    const status = ["active", "inactive"].includes(payload.status) ? payload.status : "";
    if (!status) {
      sendJson(res, 400, { error: "Status inválido." });
      return;
    }
    if (id === req.user.id && status === "inactive") {
      sendJson(res, 400, { error: "Você não pode desativar o próprio usuário logado." });
      return;
    }
    db.prepare("UPDATE users SET status = :status, updated_at = :updated_at WHERE id = :id")
      .run({ id, status, updated_at: now() });
    if (status === "inactive") {
      db.prepare("DELETE FROM sessions WHERE user_id = :id").run({ id });
    }
    sendJson(res, 200, { users: listUsers(db) });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/users/")) {
    if (id === req.user.id) {
      sendJson(res, 400, { error: "Você não pode excluir o próprio usuário logado." });
      return;
    }
    const linkedRows = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM catalog_albums WHERE user_id = :id) +
        (SELECT COUNT(*) FROM listening_logs WHERE user_id = :id) +
        (SELECT COUNT(*) FROM articles WHERE author_id = :id) +
        (SELECT COUNT(*) FROM bubbles WHERE created_by = :id) +
        (SELECT COUNT(*) FROM bubble_members WHERE user_id = :id) +
        (SELECT COUNT(*) FROM bubble_posts WHERE user_id = :id) +
        (SELECT COUNT(*) FROM bubble_comments WHERE user_id = :id) AS total
    `).get({ id }).total;

    if (linkedRows > 0) {
      db.prepare("UPDATE users SET status = 'inactive', updated_at = :updated_at WHERE id = :id")
        .run({ id, updated_at: now() });
      db.prepare("DELETE FROM sessions WHERE user_id = :id").run({ id });
      sendJson(res, 200, {
        users: listUsers(db),
        warning: "Usuário possui histórico vinculado e foi desativado em vez de excluído."
      });
      return;
    }

    db.prepare("DELETE FROM sessions WHERE user_id = :id").run({ id });
    db.prepare("DELETE FROM users WHERE id = :id").run({ id });
    sendJson(res, 200, { users: listUsers(db) });
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
}

async function handleAuthApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readBody(req);
    const email = clean(payload.email).toLowerCase();
    const password = String(payload.password || "");

    if (!email || !password) {
      sendJson(res, 400, { error: "Informe email e senha." });
      return;
    }

    const db = getDatabase();
    const user = db.prepare(`
      SELECT id, name, email, password_hash, role, status, avatar_url, bio, last_login_at
      FROM users
      WHERE lower(email) = :email
    `).get({ email });

    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: "Email ou senha inválidos." });
      return;
    }

    if (user.status !== "active") {
      sendJson(res, 403, { error: "Usuário inativo. Acesso bloqueado." });
      return;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const timestamp = now();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (:id, :user_id, :token_hash, :expires_at, :created_at)
    `).run({
      id: createId("session"),
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: timestamp
    });

    db.prepare("UPDATE users SET last_login_at = :last_login_at, updated_at = :updated_at WHERE id = :id")
      .run({ id: user.id, last_login_at: timestamp, updated_at: timestamp });

    setSessionCookie(res, token, expiresAt);
    sendJson(res, 200, { user: publicUser({ ...user, last_login_at: timestamp }) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      getDatabase().prepare("DELETE FROM sessions WHERE token_hash = :token_hash")
        .run({ token_hash: hashToken(token) });
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const auth = getAuthenticatedUser(req);
    if (!auth) {
      sendJson(res, 401, { error: "Sessão ausente ou expirada." });
      return;
    }
    sendJson(res, 200, { user: publicUser(auth.user) });
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
}

function requireAuth(req, res) {
  const auth = getAuthenticatedUser(req);
  if (!auth) {
    sendJson(res, 401, { error: "Sessão ausente ou expirada." });
    return null;
  }
  return auth;
}

function requireAdmin(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.user.role !== "admin") {
    sendJson(res, 403, { error: "Acesso restrito ao administrador." });
    return null;
  }
  return auth;
}

function canModerateContent(user, target) {
  return Boolean(user && target && (user.role === "admin" || target.author_id === user.id || target.authorId === user.id));
}

function getAuthenticatedUser(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const db = getDatabase();
  const session = db.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.expires_at,
      users.id,
      users.name,
      users.email,
      users.role,
      users.status,
      users.avatar_url,
      users.bio,
      users.last_login_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = :token_hash
  `).get({ token_hash: hashToken(token) });

  if (!session) return null;
  if (session.expires_at <= now() || session.status !== "active") {
    db.prepare("DELETE FROM sessions WHERE id = :id").run({ id: session.session_id });
    return null;
  }

  return {
    sessionId: session.session_id,
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
      status: session.status,
      avatar_url: session.avatar_url,
      bio: session.bio,
      last_login_at: session.last_login_at
    }
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatar_url || user.avatarUrl || "",
    bio: user.bio || "",
    createdAt: user.created_at || user.createdAt || "",
    updatedAt: user.updated_at || user.updatedAt || "",
    lastLoginAt: user.last_login_at || user.lastLoginAt || ""
  };
}

function listArticlesForUser(user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  const rows = db.prepare(`
    SELECT articles.*, users.name AS author_name
    FROM articles
    JOIN users ON users.id = articles.author_id
    WHERE articles.scope = 'community'
      ${isAdmin ? "" : "AND articles.status = 'published'"}
    ORDER BY
      CASE articles.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      COALESCE(articles.published_at, articles.updated_at) DESC
  `).all();
  return rows.map(articleToApi);
}

function getArticleForUser(slug, user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  const row = db.prepare(`
    SELECT articles.*, users.name AS author_name
    FROM articles
    JOIN users ON users.id = articles.author_id
    WHERE articles.slug = :slug
      AND articles.scope = 'community'
      ${isAdmin ? "" : "AND articles.status = 'published'"}
  `).get({ slug });
  return row ? articleToApi(row) : null;
}

function createArticle(db, authorId, payload, scope = "community") {
  const data = normalizeArticlePayload(payload);
  const timestamp = now();
  const id = createId("art");
  const slug = uniqueArticleSlug(db, slugify(data.title));
  const publishedAt = data.status === "published" ? timestamp : "";

  db.prepare(`
    INSERT INTO articles (
      id, author_id, title, slug, scope, summary, content, cover_url, status,
      published_at, created_at, updated_at
    )
    VALUES (
      :id, :author_id, :title, :slug, :scope, :summary, :content, :cover_url, :status,
      :published_at, :created_at, :updated_at
    )
  `).run({
    id,
    author_id: authorId,
    title: data.title,
    slug,
    scope,
    summary: data.summary,
    content: data.content,
    cover_url: data.coverUrl,
    status: data.status,
    published_at: publishedAt,
    created_at: timestamp,
    updated_at: timestamp
  });

  return getArticleForAdminById(id);
}

function updateArticle(db, id, payload) {
  const current = db.prepare("SELECT * FROM articles WHERE id = :id").get({ id });
  if (!current) return null;

  const data = normalizeArticlePayload(payload);
  const timestamp = now();
  const nextSlug = data.title === current.title
    ? current.slug
    : uniqueArticleSlug(db, slugify(data.title), id);
  const publishedAt = data.status === "published"
    ? (current.published_at || timestamp)
    : "";

  db.prepare(`
    UPDATE articles
    SET title = :title,
        slug = :slug,
        summary = :summary,
        content = :content,
        cover_url = :cover_url,
        status = :status,
        published_at = :published_at,
        updated_at = :updated_at
    WHERE id = :id
  `).run({
    id,
    title: data.title,
    slug: nextSlug,
    summary: data.summary,
    content: data.content,
    cover_url: data.coverUrl,
    status: data.status,
    published_at: publishedAt,
    updated_at: timestamp
  });

  return getArticleForAdminById(id);
}

function getArticleForAdminById(id) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT articles.*, users.name AS author_name
    FROM articles
    JOIN users ON users.id = articles.author_id
    WHERE articles.id = :id
  `).get({ id });
  return row ? articleToApi(row) : null;
}

function normalizeArticlePayload(payload) {
  const title = clean(payload.title);
  const summary = clean(payload.summary);
  const content = clean(payload.content);
  const coverUrl = clean(payload.coverUrl || payload.cover_url);
  const status = ["draft", "published", "archived"].includes(payload.status) ? payload.status : "draft";

  if (!title) throw publicError("Informe o titulo do artigo.");
  if (!content) throw publicError("Informe o conteudo do artigo.");

  return { title, summary, content, coverUrl, status };
}

function uniqueArticleSlug(db, baseSlug, currentId = "") {
  const base = baseSlug || "artigo";
  let slug = base;
  let suffix = 2;
  while (true) {
    const existing = db.prepare("SELECT id FROM articles WHERE slug = :slug").get({ slug });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function slugify(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function articleToApi(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    scope: row.scope || "community",
    title: row.title,
    slug: row.slug,
    summary: row.summary || "",
    content: row.content || "",
    coverUrl: row.cover_url || "",
    status: row.status,
    commentsCount: Number(row.comments_count || 0),
    publishedAt: row.published_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listPodcastEpisodesForUser(user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  const rows = db.prepare(`
    SELECT podcast_episodes.*, users.name AS author_name
    FROM podcast_episodes
    JOIN users ON users.id = podcast_episodes.author_id
    WHERE podcast_episodes.scope = 'community'
      ${isAdmin ? "" : "AND podcast_episodes.status = 'published'"}
    ORDER BY
      CASE podcast_episodes.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      COALESCE(podcast_episodes.published_at, podcast_episodes.updated_at) DESC
  `).all();
  return rows.map(podcastEpisodeToApi);
}

function getPodcastEpisodeForUser(slug, user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  const row = db.prepare(`
    SELECT podcast_episodes.*, users.name AS author_name
    FROM podcast_episodes
    JOIN users ON users.id = podcast_episodes.author_id
    WHERE podcast_episodes.slug = :slug
      AND podcast_episodes.scope = 'community'
      ${isAdmin ? "" : "AND podcast_episodes.status = 'published'"}
  `).get({ slug });
  return row ? podcastEpisodeToApi(row) : null;
}

function createPodcastEpisode(db, authorId, payload, scope = "community") {
  const data = normalizePodcastPayload(payload);
  const timestamp = now();
  const id = createId("pod");
  const slug = uniquePodcastSlug(db, slugify(data.title));
  const publishedAt = data.status === "published" ? timestamp : "";

  db.prepare(`
    INSERT INTO podcast_episodes (
      id, author_id, title, slug, scope, summary, description, audio_url, external_url,
      cover_url, duration_min, status, published_at, created_at, updated_at
    )
    VALUES (
      :id, :author_id, :title, :slug, :scope, :summary, :description, :audio_url, :external_url,
      :cover_url, :duration_min, :status, :published_at, :created_at, :updated_at
    )
  `).run({
    id,
    author_id: authorId,
    title: data.title,
    slug,
    scope,
    summary: data.summary,
    description: data.description,
    audio_url: data.audioUrl,
    external_url: data.externalUrl,
    cover_url: data.coverUrl,
    duration_min: data.durationMin,
    status: data.status,
    published_at: publishedAt,
    created_at: timestamp,
    updated_at: timestamp
  });

  return getPodcastEpisodeForAdminById(id);
}

function updatePodcastEpisode(db, id, payload) {
  const current = db.prepare("SELECT * FROM podcast_episodes WHERE id = :id").get({ id });
  if (!current) return null;

  const data = normalizePodcastPayload(payload);
  const timestamp = now();
  const nextSlug = data.title === current.title
    ? current.slug
    : uniquePodcastSlug(db, slugify(data.title), id);
  const publishedAt = data.status === "published"
    ? (current.published_at || timestamp)
    : "";

  db.prepare(`
    UPDATE podcast_episodes
    SET title = :title,
        slug = :slug,
        summary = :summary,
        description = :description,
        audio_url = :audio_url,
        external_url = :external_url,
        cover_url = :cover_url,
        duration_min = :duration_min,
        status = :status,
        published_at = :published_at,
        updated_at = :updated_at
    WHERE id = :id
  `).run({
    id,
    title: data.title,
    slug: nextSlug,
    summary: data.summary,
    description: data.description,
    audio_url: data.audioUrl,
    external_url: data.externalUrl,
    cover_url: data.coverUrl,
    duration_min: data.durationMin,
    status: data.status,
    published_at: publishedAt,
    updated_at: timestamp
  });

  return getPodcastEpisodeForAdminById(id);
}

function getPodcastEpisodeForAdminById(id) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT podcast_episodes.*, users.name AS author_name
    FROM podcast_episodes
    JOIN users ON users.id = podcast_episodes.author_id
    WHERE podcast_episodes.id = :id
  `).get({ id });
  return row ? podcastEpisodeToApi(row) : null;
}

function getPodcastEpisodeRowForUser(id, user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  return db.prepare(`
    SELECT podcast_episodes.*, users.name AS author_name
    FROM podcast_episodes
    JOIN users ON users.id = podcast_episodes.author_id
    WHERE podcast_episodes.id = :id
      ${isAdmin ? "" : "AND (podcast_episodes.status = 'published' OR podcast_episodes.author_id = :user_id)"}
  `).get({ id, user_id: user?.id || "" });
}

async function streamPodcastAudio(req, res, id, user) {
  const episode = getPodcastEpisodeRowForUser(id, user);
  if (!episode?.audio_url) {
    sendJson(res, 404, { error: "Audio do episodio nao encontrado." });
    return;
  }

  const candidates = podcastAudioCandidates(episode.audio_url);
  const range = req.headers.range;
  const headers = {
    "User-Agent": "MyAlbums/1.0 podcast-audio-proxy",
    Accept: "audio/*,*/*"
  };
  if (range) headers.Range = range;

  let lastStatus = 0;
  for (const candidate of candidates) {
    let upstream = await fetch(candidate, { headers, redirect: "follow" });
    lastStatus = upstream.status;
    let contentType = upstream.headers.get("content-type") || "";

    if (upstream.ok && contentType.includes("text/html")) {
      const html = await upstream.text();
      const confirmedUrl = googleDriveConfirmedDownloadUrl(html);
      if (confirmedUrl) {
        upstream = await fetch(confirmedUrl, { headers, redirect: "follow" });
        lastStatus = upstream.status;
        contentType = upstream.headers.get("content-type") || "";
      }
    }

    if (!upstream.ok || contentType.includes("text/html")) {
      await upstream.body?.cancel?.();
      continue;
    }

    res.writeHead(upstream.status === 206 ? 206 : 200, {
      "Content-Type": contentType || "audio/mpeg",
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
      ...(upstream.headers.get("content-range") ? { "Content-Range": upstream.headers.get("content-range") } : {}),
      "Cache-Control": "private, max-age=300"
    });
    Readable.fromWeb(upstream.body).pipe(res);
    return;
  }

  sendJson(res, 502, {
    error: lastStatus
      ? "Nao foi possivel carregar o audio do Google Drive. Verifique se o arquivo esta publico para qualquer pessoa com o link."
      : "Nao foi possivel carregar o audio do episodio."
  });
}

function normalizePodcastPayload(payload) {
  const title = clean(payload.title);
  const summary = clean(payload.summary);
  const description = clean(payload.description || payload.content);
  const audioUrl = normalizePodcastAudioUrl(payload.audioUrl || payload.audio_url);
  const externalUrl = clean(payload.externalUrl || payload.external_url);
  const coverUrl = clean(payload.coverUrl || payload.cover_url);
  const durationMin = Math.max(Number(payload.durationMin || payload.duration_min || 0), 0);
  const status = ["draft", "published", "archived"].includes(payload.status) ? payload.status : "draft";

  if (!title) throw publicError("Informe o titulo do episodio.");
  if (!description) throw publicError("Informe a descricao do episodio.");

  return { title, summary, description, audioUrl, externalUrl, coverUrl, durationMin, status };
}

function normalizePodcastAudioUrl(value) {
  const url = clean(value);
  if (!url) return "";

  const id = googleDriveFileId(url);

  if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  return url;
}

function podcastAudioCandidates(value) {
  const url = normalizePodcastAudioUrl(value);
  const id = googleDriveFileId(url);
  if (!id) return [url].filter(Boolean);
  return [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,
    `https://docs.google.com/uc?export=download&id=${encodeURIComponent(id)}`
  ];
}

function googleDriveFileId(value) {
  const url = clean(value);
  if (!url) return "";
  const filePathMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  const openIdMatch = url.match(/drive\.google\.com\/open\?[^#]*\bid=([^&#]+)/i);
  const ucIdMatch = url.match(/drive\.google\.com\/uc\?[^#]*\bid=([^&#]+)/i);
  const userContentIdMatch = url.match(/drive\.usercontent\.google\.com\/download\?[^#]*\bid=([^&#]+)/i);
  return filePathMatch?.[1] || openIdMatch?.[1] || ucIdMatch?.[1] || userContentIdMatch?.[1] || "";
}

function googleDriveConfirmedDownloadUrl(html) {
  const formMatch = String(html || "").match(/<form\b[^>]*id=["']download-form["'][^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
  if (!formMatch) return "";

  const action = decodeHtmlAttribute(formMatch[1]);
  const body = formMatch[2] || "";
  const params = new URLSearchParams();
  for (const input of body.matchAll(/<input\b[^>]*>/gi)) {
    const tag = input[0];
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] || "";
    if (name) params.set(decodeHtmlAttribute(name), decodeHtmlAttribute(value));
  }

  if (!params.get("id")) return "";
  return `${action}?${params.toString()}`;
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function uniquePodcastSlug(db, baseSlug, currentId = "") {
  const base = baseSlug || "episodio";
  let slug = base;
  let suffix = 2;
  while (true) {
    const existing = db.prepare("SELECT id FROM podcast_episodes WHERE slug = :slug").get({ slug });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function podcastEpisodeToApi(row) {
  const audioUrl = normalizePodcastAudioUrl(row.audio_url || "");
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    scope: row.scope || "community",
    title: row.title,
    slug: row.slug,
    summary: row.summary || "",
    description: row.description || "",
    audioUrl,
    playbackAudioUrl: audioUrl ? `/api/podcasts/${encodeURIComponent(row.id)}/audio` : "",
    externalUrl: row.external_url || "",
    coverUrl: row.cover_url || "",
    durationMin: row.duration_min || 0,
    status: row.status,
    commentsCount: Number(row.comments_count || 0),
    publishedAt: row.published_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function resolveArticleTarget(idOrSlug, user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  return db.prepare(`
    SELECT id, status, author_id
    FROM articles
    WHERE (id = :value OR slug = :value)
      ${isAdmin ? "" : "AND (status = 'published' OR author_id = :user_id)"}
  `).get({ value: idOrSlug, user_id: user?.id || "" });
}

function resolvePodcastTarget(idOrSlug, user) {
  const db = getDatabase();
  const isAdmin = user?.role === "admin";
  return db.prepare(`
    SELECT id, status, author_id
    FROM podcast_episodes
    WHERE (id = :value OR slug = :value)
      ${isAdmin ? "" : "AND (status = 'published' OR author_id = :user_id)"}
  `).get({ value: idOrSlug, user_id: user?.id || "" });
}

function listCommunityComments(targetType, targetId, includeModerated = false) {
  const rows = getDatabase().prepare(`
    SELECT cc.*, users.name AS author_name, users.avatar_url AS author_avatar_url
    FROM community_comments cc
    JOIN users ON users.id = cc.user_id
    WHERE cc.target_type = :target_type
      AND cc.target_id = :target_id
      AND (:include_moderated = 1 OR cc.status = 'active')
    ORDER BY cc.created_at ASC
  `).all({
    target_type: targetType,
    target_id: targetId,
    include_moderated: includeModerated ? 1 : 0
  });
  return buildCommentTree(rows.map(communityCommentToApi));
}

function createCommunityComment(db, targetType, targetId, payload, user) {
  const content = clean(payload.content);
  if (!content) throw publicError("Escreva o comentario.");
  if (content.length > 800) throw publicError("O comentario pode ter no maximo 800 caracteres.");

  const parentCommentId = clean(payload.parentCommentId || payload.parent_comment_id);
  if (parentCommentId) {
    const parent = db.prepare(`
      SELECT id
      FROM community_comments
      WHERE id = :id
        AND target_type = :target_type
        AND target_id = :target_id
        AND status = 'active'
    `).get({ id: parentCommentId, target_type: targetType, target_id: targetId });
    if (!parent) throw publicError("Comentario principal nao encontrado.", 404);
  }

  const timestamp = now();
  db.prepare(`
    INSERT INTO community_comments (
      id, target_type, target_id, user_id, parent_comment_id, content, status, created_at, updated_at
    )
    VALUES (
      :id, :target_type, :target_id, :user_id, :parent_comment_id, :content, 'active', :created_at, :updated_at
    )
  `).run({
    id: createId("ccom"),
    target_type: targetType,
    target_id: targetId,
    user_id: user.id,
    parent_comment_id: parentCommentId || null,
    content,
    created_at: timestamp,
    updated_at: timestamp
  });
}

function moderateCommunityComment(db, targetType, targetId, commentId, payload) {
  const status = ["active", "hidden", "removed"].includes(payload.status) ? payload.status : "";
  if (!status) throw publicError("Status de comentario invalido.");
  const comment = db.prepare(`
    SELECT id
    FROM community_comments
    WHERE id = :id
      AND target_type = :target_type
      AND target_id = :target_id
  `).get({ id: commentId, target_type: targetType, target_id: targetId });
  if (!comment) throw publicError("Comentario nao encontrado.", 404);
  db.prepare("UPDATE community_comments SET status = :status, updated_at = :updated_at WHERE id = :id")
    .run({ id: commentId, status, updated_at: now() });
}

function listReviewComments(reviewId, includeModerated = false) {
  const rows = getDatabase().prepare(`
    SELECT rc.*, users.name AS author_name, users.avatar_url AS author_avatar_url
    FROM review_comments rc
    JOIN users ON users.id = rc.user_id
    WHERE rc.review_id = :review_id
      AND (:include_moderated = 1 OR rc.status = 'active')
    ORDER BY rc.created_at ASC
  `).all({
    review_id: reviewId,
    include_moderated: includeModerated ? 1 : 0
  });
  return buildCommentTree(rows.map(reviewCommentToApi));
}

function createReviewComment(db, reviewId, payload, user) {
  const content = clean(payload.content);
  if (!content) throw publicError("Escreva o comentario.");
  if (content.length > 800) throw publicError("O comentario pode ter no maximo 800 caracteres.");

  const parentCommentId = clean(payload.parentCommentId || payload.parent_comment_id);
  if (parentCommentId) {
    const parent = db.prepare(`
      SELECT id
      FROM review_comments
      WHERE id = :id
        AND review_id = :review_id
        AND status = 'active'
    `).get({ id: parentCommentId, review_id: reviewId });
    if (!parent) throw publicError("Comentario principal nao encontrado.", 404);
  }

  const timestamp = now();
  db.prepare(`
    INSERT INTO review_comments (
      id, review_id, user_id, parent_comment_id, content, status, created_at, updated_at
    )
    VALUES (
      :id, :review_id, :user_id, :parent_comment_id, :content, 'active', :created_at, :updated_at
    )
  `).run({
    id: createId("rcom"),
    review_id: reviewId,
    user_id: user.id,
    parent_comment_id: parentCommentId || null,
    content,
    created_at: timestamp,
    updated_at: timestamp
  });
}

function moderateReviewComment(db, reviewId, commentId, payload) {
  const status = ["active", "hidden", "removed"].includes(payload.status) ? payload.status : "";
  if (!status) throw publicError("Status de comentario invalido.");
  const comment = db.prepare(`
    SELECT id
    FROM review_comments
    WHERE id = :id
      AND review_id = :review_id
  `).get({ id: commentId, review_id: reviewId });
  if (!comment) throw publicError("Comentario nao encontrado.", 404);
  db.prepare("UPDATE review_comments SET status = :status, updated_at = :updated_at WHERE id = :id")
    .run({ id: commentId, status, updated_at: now() });
}

function listVisibleBubbles(user) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      b.*,
      creator.name AS creator_name,
      bm.role AS my_role,
      bm.status AS my_status,
      (SELECT COUNT(*) FROM bubble_members WHERE bubble_id = b.id AND status = 'active') AS member_count,
      (SELECT COUNT(*) FROM bubble_posts WHERE bubble_id = b.id AND status = 'active') AS post_count
    FROM bubbles b
    JOIN users creator ON creator.id = b.created_by
    LEFT JOIN bubble_members bm ON bm.bubble_id = b.id AND bm.user_id = :user_id
    WHERE b.status = 'active'
      AND (
        :is_admin = 1
        OR b.visibility IN ('public', 'restricted')
        OR bm.status = 'active'
      )
    ORDER BY b.created_at DESC
  `).all({ user_id: user.id, is_admin: user.role === "admin" ? 1 : 0 });
  return rows.map(bubbleToApi);
}

function getBubbleDetailForUser(bubbleId, user) {
  const db = getDatabase();
  const row = getBubbleRowForUser(db, bubbleId, user);
  if (!row) return null;
  const canModerate = canManageBubble(bubbleId, user);
  return {
    ...bubbleToApi(row),
    canModerate,
    members: listBubbleMembers(db, bubbleId),
    posts: listBubblePosts(db, bubbleId, canModerate)
  };
}

function getBubbleRowForUser(db, bubbleId, user) {
  return db.prepare(`
    SELECT
      b.*,
      creator.name AS creator_name,
      bm.role AS my_role,
      bm.status AS my_status,
      (SELECT COUNT(*) FROM bubble_members WHERE bubble_id = b.id AND status = 'active') AS member_count,
      (SELECT COUNT(*) FROM bubble_posts WHERE bubble_id = b.id AND status = 'active') AS post_count
    FROM bubbles b
    JOIN users creator ON creator.id = b.created_by
    LEFT JOIN bubble_members bm ON bm.bubble_id = b.id AND bm.user_id = :user_id
    WHERE b.id = :id
      AND b.status = 'active'
      AND (
        :is_admin = 1
        OR b.visibility IN ('public', 'restricted')
        OR bm.status = 'active'
      )
  `).get({ id: bubbleId, user_id: user.id, is_admin: user.role === "admin" ? 1 : 0 });
}

function createBubble(db, user, payload) {
  const { name, description, coverUrl, visibility } = normalizeBubblePayload(payload);
  if (!name) throw publicError("Informe o nome da Bubble.");
  const existingOwnerBubble = db.prepare(`
    SELECT id
    FROM bubbles
    WHERE created_by = :user_id
      AND status IN ('active', 'inactive')
    LIMIT 1
  `).get({ user_id: user.id });
  if (existingOwnerBubble) {
    throw publicError("Cada usuario pode criar apenas uma Bubble neste primeiro momento.", 409);
  }

  const timestamp = now();
  const id = createId("bub");
  const memberId = createId("bmem");
  db.prepare(`
    INSERT INTO bubbles (id, name, description, cover_url, visibility, created_by, status, created_at, updated_at)
    VALUES (:id, :name, :description, :cover_url, :visibility, :created_by, 'active', :created_at, :updated_at)
  `).run({
    id,
    name,
    description,
    cover_url: coverUrl,
    visibility,
    created_by: user.id,
    created_at: timestamp,
    updated_at: timestamp
  });
  db.prepare(`
    INSERT INTO bubble_members (id, bubble_id, user_id, role, status, invited_by, created_at, updated_at)
    VALUES (:id, :bubble_id, :user_id, 'owner', 'active', :invited_by, :created_at, :updated_at)
  `).run({
    id: memberId,
    bubble_id: id,
    user_id: user.id,
    invited_by: user.id,
    created_at: timestamp,
    updated_at: timestamp
  });
  return getBubbleDetailForUser(id, user);
}

function updateBubble(db, bubbleId, payload, user) {
  const current = db.prepare("SELECT id, created_by FROM bubbles WHERE id = :id AND status = 'active'")
    .get({ id: bubbleId });
  if (!current) throw publicError("Bubble nao encontrada.", 404);
  if (current.created_by !== user.id) {
    throw publicError("Apenas o owner que criou a Bubble pode editar nome e imagem.", 403);
  }

  const { name, description, coverUrl, visibility } = normalizeBubblePayload(payload);
  const timestamp = now();
  db.prepare(`
    UPDATE bubbles
    SET name = :name,
        description = :description,
        cover_url = :cover_url,
        visibility = :visibility,
        updated_at = :updated_at
    WHERE id = :id
  `).run({
    id: bubbleId,
    name,
    description,
    cover_url: coverUrl,
    visibility,
    updated_at: timestamp
  });

  return getBubbleDetailForUser(bubbleId, user);
}

function normalizeBubblePayload(payload) {
  const name = clean(payload.name);
  const description = clean(payload.description);
  const coverUrl = clean(payload.coverUrl || payload.cover_url);
  const visibility = ["public", "private", "restricted"].includes(payload.visibility) ? payload.visibility : "restricted";
  if (!name) throw publicError("Informe o nome da Bubble.");
  return { name, description, coverUrl, visibility };
}

function requestBubbleJoin(db, bubbleId, user) {
  const bubble = getBubbleRowForUser(db, bubbleId, user);
  if (!bubble) throw publicError("Bubble indisponivel.", 404);
  if (bubble.visibility === "private" && user.role !== "admin") {
    throw publicError("Bubble privada exige convite.", 403);
  }
  if (bubble.my_status === "active") return getBubbleDetailForUser(bubbleId, user);

  const timestamp = now();
  const existing = db.prepare("SELECT id, status FROM bubble_members WHERE bubble_id = :bubble_id AND user_id = :user_id")
    .get({ bubble_id: bubbleId, user_id: user.id });
  if (existing) {
    db.prepare("UPDATE bubble_members SET status = 'pending', updated_at = :updated_at WHERE id = :id")
      .run({ id: existing.id, updated_at: timestamp });
  } else {
    db.prepare(`
      INSERT INTO bubble_members (id, bubble_id, user_id, role, status, invited_by, created_at, updated_at)
      VALUES (:id, :bubble_id, :user_id, 'member', 'pending', NULL, :created_at, :updated_at)
    `).run({
      id: createId("bmem"),
      bubble_id: bubbleId,
      user_id: user.id,
      created_at: timestamp,
      updated_at: timestamp
    });
  }
  return getBubbleDetailForUser(bubbleId, user);
}

function inviteBubbleMember(db, bubbleId, payload, user) {
  const target = resolveBubbleInviteUser(db, payload);
  if (!target) throw publicError("Usuario do convite nao encontrado.");
  const bubble = db.prepare("SELECT id FROM bubbles WHERE id = :id AND status = 'active'").get({ id: bubbleId });
  if (!bubble) throw publicError("Bubble nao encontrada.", 404);

  const timestamp = now();
  const existing = db.prepare("SELECT id FROM bubble_members WHERE bubble_id = :bubble_id AND user_id = :user_id")
    .get({ bubble_id: bubbleId, user_id: target.id });
  if (existing) {
    db.prepare(`
      UPDATE bubble_members
      SET role = 'member', status = 'active', invited_by = :invited_by, updated_at = :updated_at
      WHERE id = :id
    `).run({ id: existing.id, invited_by: user.id, updated_at: timestamp });
  } else {
    db.prepare(`
      INSERT INTO bubble_members (id, bubble_id, user_id, role, status, invited_by, created_at, updated_at)
      VALUES (:id, :bubble_id, :user_id, 'member', 'active', :invited_by, :created_at, :updated_at)
    `).run({
      id: createId("bmem"),
      bubble_id: bubbleId,
      user_id: target.id,
      invited_by: user.id,
      created_at: timestamp,
      updated_at: timestamp
    });
  }
  return getBubbleDetailForUser(bubbleId, user);
}

function createBubblePost(db, bubbleId, payload, user) {
  if (!canInteractInBubble(bubbleId, user)) {
    throw publicError("Apenas membros ativos podem publicar nesta Bubble.", 403);
  }
  const content = clean(payload.content);
  const title = clean(payload.title);
  if (!content) throw publicError("Escreva o conteudo da publicacao.");

  const timestamp = now();
  db.prepare(`
    INSERT INTO bubble_posts (id, bubble_id, user_id, title, content, album_id, status, created_at, updated_at)
    VALUES (:id, :bubble_id, :user_id, :title, :content, NULL, 'active', :created_at, :updated_at)
  `).run({
    id: createId("bpost"),
    bubble_id: bubbleId,
    user_id: user.id,
    title,
    content,
    created_at: timestamp,
    updated_at: timestamp
  });
  return getBubbleDetailForUser(bubbleId, user);
}

function createBubbleComment(db, bubbleId, postId, payload, user) {
  if (!canInteractInBubble(bubbleId, user)) {
    throw publicError("Apenas membros ativos podem comentar nesta Bubble.", 403);
  }
  const post = db.prepare("SELECT id FROM bubble_posts WHERE id = :id AND bubble_id = :bubble_id AND status = 'active'")
    .get({ id: postId, bubble_id: bubbleId });
  if (!post) throw publicError("Publicacao nao encontrada.", 404);

  const content = clean(payload.content);
  if (!content) throw publicError("Escreva o comentario.");
  const parentCommentId = clean(payload.parentCommentId || payload.parent_comment_id);
  if (parentCommentId) {
    const parent = db.prepare(`
      SELECT bc.id
      FROM bubble_comments bc
      JOIN bubble_posts bp ON bp.id = bc.post_id
      WHERE bc.id = :id
        AND bc.post_id = :post_id
        AND bp.bubble_id = :bubble_id
        AND bc.status = 'active'
    `).get({ id: parentCommentId, post_id: postId, bubble_id: bubbleId });
    if (!parent) throw publicError("Comentario principal nao encontrado.", 404);
  }
  const timestamp = now();
  db.prepare(`
    INSERT INTO bubble_comments (id, post_id, user_id, parent_comment_id, content, status, created_at, updated_at)
    VALUES (:id, :post_id, :user_id, :parent_comment_id, :content, 'active', :created_at, :updated_at)
  `).run({
    id: createId("bcom"),
    post_id: postId,
    user_id: user.id,
    parent_comment_id: parentCommentId || null,
    content,
    created_at: timestamp,
    updated_at: timestamp
  });
  return getBubbleDetailForUser(bubbleId, user);
}

function archiveBubble(db, bubbleId, user) {
  if (!canManageBubble(bubbleId, user)) {
    throw publicError("Apenas admin, owner ou moderador pode arquivar a Bubble.", 403);
  }
  db.prepare("UPDATE bubbles SET status = 'archived', updated_at = :updated_at WHERE id = :id")
    .run({ id: bubbleId, updated_at: now() });
  return getBubbleDetailForUser(bubbleId, user) || { id: bubbleId, status: "archived" };
}

function moderateBubbleMember(db, bubbleId, memberId, payload, user) {
  if (!canManageBubble(bubbleId, user)) {
    throw publicError("Apenas admin, owner ou moderador pode moderar membros.", 403);
  }
  const status = ["active", "removed", "blocked"].includes(payload.status) ? payload.status : "";
  const role = ["owner", "moderator", "member"].includes(payload.role) ? payload.role : "";
  if (!status && !role) throw publicError("Informe status ou permissao valida.");

  const member = db.prepare("SELECT * FROM bubble_members WHERE id = :id AND bubble_id = :bubble_id")
    .get({ id: memberId, bubble_id: bubbleId });
  if (!member) throw publicError("Membro nao encontrado.", 404);
  if (member.user_id === user.id && status && status !== "active") {
    throw publicError("Voce nao pode remover ou bloquear a si mesmo.", 400);
  }

  db.prepare(`
    UPDATE bubble_members
    SET status = COALESCE(:status, status),
        role = COALESCE(:role, role),
        updated_at = :updated_at
    WHERE id = :id
  `).run({
    id: memberId,
    status: status || null,
    role: role || null,
    updated_at: now()
  });
  return getBubbleDetailForUser(bubbleId, user);
}

function moderateBubblePost(db, bubbleId, postId, payload, user) {
  if (!canManageBubble(bubbleId, user)) {
    throw publicError("Apenas admin, owner ou moderador pode moderar publicacoes.", 403);
  }
  const status = ["active", "hidden", "removed"].includes(payload.status) ? payload.status : "";
  if (!status) throw publicError("Status de publicacao invalido.");
  const post = db.prepare("SELECT id FROM bubble_posts WHERE id = :id AND bubble_id = :bubble_id")
    .get({ id: postId, bubble_id: bubbleId });
  if (!post) throw publicError("Publicacao nao encontrada.", 404);

  db.prepare("UPDATE bubble_posts SET status = :status, updated_at = :updated_at WHERE id = :id")
    .run({ id: postId, status, updated_at: now() });
  return getBubbleDetailForUser(bubbleId, user);
}

function moderateBubbleComment(db, bubbleId, postId, commentId, payload, user) {
  if (!canManageBubble(bubbleId, user)) {
    throw publicError("Apenas admin, owner ou moderador pode moderar comentarios.", 403);
  }
  const status = ["active", "hidden", "removed"].includes(payload.status) ? payload.status : "";
  if (!status) throw publicError("Status de comentario invalido.");
  const comment = db.prepare(`
    SELECT bc.id
    FROM bubble_comments bc
    JOIN bubble_posts bp ON bp.id = bc.post_id
    WHERE bc.id = :id AND bc.post_id = :post_id AND bp.bubble_id = :bubble_id
  `).get({ id: commentId, post_id: postId, bubble_id: bubbleId });
  if (!comment) throw publicError("Comentario nao encontrado.", 404);

  db.prepare("UPDATE bubble_comments SET status = :status, updated_at = :updated_at WHERE id = :id")
    .run({ id: commentId, status, updated_at: now() });
  return getBubbleDetailForUser(bubbleId, user);
}

function canInteractInBubble(bubbleId, user) {
  if (user.role === "admin") return true;
  const member = getDatabase().prepare(`
    SELECT status FROM bubble_members
    WHERE bubble_id = :bubble_id AND user_id = :user_id
  `).get({ bubble_id: bubbleId, user_id: user.id });
  return member?.status === "active";
}

function canManageBubble(bubbleId, user) {
  if (user.role === "admin") return true;
  const member = getDatabase().prepare(`
    SELECT role, status FROM bubble_members
    WHERE bubble_id = :bubble_id AND user_id = :user_id
  `).get({ bubble_id: bubbleId, user_id: user.id });
  return member?.status === "active" && ["owner", "moderator"].includes(member.role);
}

function resolveBubbleInviteUser(db, payload) {
  const id = clean(payload.userId || payload.user_id);
  const email = clean(payload.email).toLowerCase();
  if (id) {
    return db.prepare("SELECT id, name, email FROM users WHERE id = :id AND status = 'active'").get({ id });
  }
  if (email) {
    return db.prepare("SELECT id, name, email FROM users WHERE lower(email) = :email AND status = 'active'").get({ email });
  }
  return null;
}

function listBubbleMembers(db, bubbleId) {
  return db.prepare(`
    SELECT bm.id, bm.user_id, bm.role, bm.status, bm.created_at, bm.updated_at, users.name, users.email
    FROM bubble_members bm
    JOIN users ON users.id = bm.user_id
    WHERE bm.bubble_id = :bubble_id
    ORDER BY CASE bm.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, users.name
  `).all({ bubble_id: bubbleId }).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function listBubblePosts(db, bubbleId, includeModerated = false) {
  const posts = db.prepare(`
    SELECT bp.*, users.name AS author_name, users.avatar_url AS author_avatar_url
    FROM bubble_posts bp
    JOIN users ON users.id = bp.user_id
    WHERE bp.bubble_id = :bubble_id
      AND (:include_moderated = 1 OR bp.status = 'active')
    ORDER BY bp.created_at DESC
  `).all({ bubble_id: bubbleId, include_moderated: includeModerated ? 1 : 0 });
  const comments = db.prepare(`
    SELECT bc.*, users.name AS author_name, users.avatar_url AS author_avatar_url
    FROM bubble_comments bc
    JOIN users ON users.id = bc.user_id
    JOIN bubble_posts bp ON bp.id = bc.post_id
    WHERE bp.bubble_id = :bubble_id
      AND (:include_moderated = 1 OR bc.status = 'active')
    ORDER BY bc.created_at ASC
  `).all({ bubble_id: bubbleId, include_moderated: includeModerated ? 1 : 0 });
  const byPost = new Map();
  for (const comment of comments) {
    if (!byPost.has(comment.post_id)) byPost.set(comment.post_id, []);
    byPost.get(comment.post_id).push(commentToApi(comment));
  }
  return posts.map((post) => ({ ...postToApi(post), comments: buildCommentTree(byPost.get(post.id) || []) }));
}

function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];
  for (const comment of comments) {
    byId.set(comment.id, { ...comment, replies: [] });
  }
  for (const comment of byId.values()) {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId).replies.push(comment);
    } else {
      roots.push(comment);
    }
  }
  return roots;
}

function bubbleToApi(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    coverUrl: row.cover_url || "",
    visibility: row.visibility,
    status: row.status,
    createdBy: row.created_by,
    creatorName: row.creator_name || "",
    myRole: row.my_role || "",
    myStatus: row.my_status || "",
    memberCount: Number(row.member_count || 0),
    postCount: Number(row.post_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function postToApi(row) {
  return {
    id: row.id,
    bubbleId: row.bubble_id,
    userId: row.user_id,
    authorName: row.author_name || "",
    authorAvatarUrl: row.author_avatar_url || "",
    title: row.title || "",
    content: row.content || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function commentToApi(row) {
  return {
    id: row.id,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id || "",
    userId: row.user_id,
    authorName: row.author_name || "",
    authorAvatarUrl: row.author_avatar_url || "",
    content: row.content || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function communityCommentToApi(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    parentCommentId: row.parent_comment_id || "",
    userId: row.user_id,
    authorName: row.author_name || "",
    authorAvatarUrl: row.author_avatar_url || "",
    content: row.content || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function reviewCommentToApi(row) {
  return {
    id: row.id,
    reviewId: row.review_id,
    parentCommentId: row.parent_comment_id || "",
    userId: row.user_id,
    authorName: row.author_name || "",
    authorAvatarUrl: row.author_avatar_url || "",
    content: row.content || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";").map((item) => item.trim());
  const prefix = `${name}=`;
  const match = cookies.find((item) => item.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function setSessionCookie(res, token, expiresAt) {
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`
  ]);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  ]);
}

function listUsers(db = getDatabase()) {
  return db.prepare(`
    SELECT id, name, email, role, status, avatar_url, bio, created_at, updated_at, last_login_at
    FROM users
    ORDER BY role, name
  `).all().map(publicUser);
}

function normalizeUserPayload(payload, requirePassword) {
  const name = clean(payload.name);
  const email = clean(payload.email).toLowerCase();
  const password = String(payload.password || "");
  const role = ["admin", "user"].includes(payload.role) ? payload.role : "user";
  const status = ["active", "inactive"].includes(payload.status) ? payload.status : "active";
  const bio = clean(payload.bio);

  if (!name) throw publicError("Informe o nome do usuário.");
  if (!email || !email.includes("@")) throw publicError("Informe um email válido.");
  if (requirePassword && password.length < 6) throw publicError("Informe uma senha com pelo menos 6 caracteres.");
  if (password && password.length < 6) throw publicError("A nova senha precisa ter pelo menos 6 caracteres.");

  return { name, email, password, role, status, bio };
}

function normalizeProfilePayload(payload) {
  const name = clean(payload.name).slice(0, 80);
  const email = clean(payload.email).toLowerCase();
  const avatarUrl = clean(payload.avatarUrl || payload.avatar_url).slice(0, 1000);
  const bio = clean(payload.bio).slice(0, 500);
  const currentPassword = String(payload.currentPassword || "");
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || "");

  if (!name) throw publicError("Informe seu nickname.");
  if (!email || !email.includes("@")) throw publicError("Informe um email valido.");
  if (password || confirmPassword || currentPassword) {
    if (password.length < 6) throw publicError("A nova senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirmPassword) throw publicError("A confirmacao da senha nao confere.");
    if (!currentPassword) throw publicError("Informe a senha atual para alterar sua senha.");
  }

  return { name, email, avatarUrl, bio, currentPassword, password };
}

function assertEmailAvailable(db, email, currentUserId = "") {
  const existing = db.prepare("SELECT id FROM users WHERE lower(email) = :email").get({ email });
  if (existing && existing.id !== currentUserId) {
    throw publicError("Já existe um usuário cadastrado com este email.", 409);
  }
}

function publicError(message, statusCode = 400) {
  const error = new Error(message);
  error.publicMessage = message;
  error.statusCode = statusCode;
  throw error;
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Acesso negado.");
    return;
  }
  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(PUBLIC_DIR, "index.html");
  const ext = path.extname(finalPath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": [".html", ".js", ".css"].includes(ext) ? "no-store" : "public, max-age=3600"
  });
  fs.createReadStream(finalPath).pipe(res);
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ catalog: [], listeningLog: [], lists: sanitizeLists({}) }, null, 2));
  }
}

function readUserDb(userId) {
  return {
    catalog: listUserCatalog(userId),
    listeningLog: listUserListeningLogs(userId),
    lists: readLists()
  };
}

function listPublicUsers(currentUserId = "") {
  return getDatabase().prepare(`
    SELECT
      users.id,
      users.name,
      users.role,
      users.avatar_url,
      users.bio,
      users.created_at,
      CASE WHEN friend_favorites.friend_user_id IS NULL THEN 0 ELSE 1 END AS is_favorite,
      COUNT(DISTINCT listening_logs.id) AS listening_count,
      COUNT(DISTINCT listening_logs.album_id) AS album_count,
      COUNT(DISTINCT CASE WHEN COALESCE(listening_logs.observations, '') <> '' THEN listening_logs.id END) AS review_count
    FROM users
    LEFT JOIN listening_logs ON listening_logs.user_id = users.id
    LEFT JOIN friend_favorites
      ON friend_favorites.friend_user_id = users.id
      AND friend_favorites.user_id = :current_user_id
    WHERE users.status = 'active'
      AND users.role = 'user'
      AND users.id <> :current_user_id
    GROUP BY users.id
    ORDER BY users.name COLLATE NOCASE ASC
  `).all({ current_user_id: currentUserId }).map(publicUserToApi);
}

function setFriendFavorite(userId, friendUserId, enabled) {
  if (!friendUserId || friendUserId === userId) {
    const error = new Error("Perfil invalido para favoritos.");
    error.status = 400;
    throw error;
  }
  const db = getDatabase();
  const friend = db.prepare("SELECT id FROM users WHERE id = :id AND status = 'active' AND role = 'user'").get({ id: friendUserId });
  if (!friend) {
    const error = new Error("Perfil nao encontrado.");
    error.status = 404;
    throw error;
  }
  if (enabled) {
    db.prepare(`
      INSERT OR IGNORE INTO friend_favorites (user_id, friend_user_id, created_at)
      VALUES (:user_id, :friend_user_id, :created_at)
    `).run({ user_id: userId, friend_user_id: friendUserId, created_at: now() });
    return;
  }
  db.prepare("DELETE FROM friend_favorites WHERE user_id = :user_id AND friend_user_id = :friend_user_id")
    .run({ user_id: userId, friend_user_id: friendUserId });
}

function readPublicProfile(userId, viewer) {
  const row = getDatabase().prepare(`
    SELECT id, name, role, avatar_url, bio, created_at
    FROM users
    WHERE id = :id
      AND status = 'active'
  `).get({ id: userId });
  if (!row) return null;
  return {
    user: publicUserToApi(row),
    db: readUserDb(row.id),
    bubbles: listProfileBubbles(row.id, viewer),
    articles: listProfileArticles(row.id, viewer),
    podcasts: listProfilePodcasts(row.id, viewer)
  };
}

function listProfileArticles(profileUserId, viewer) {
  const includePrivate = viewer?.role === "admin" || viewer?.id === profileUserId;
  const rows = getDatabase().prepare(`
    SELECT articles.*,
      users.name AS author_name,
      (
        SELECT COUNT(*)
        FROM community_comments cc
        WHERE cc.target_type = 'article'
          AND cc.target_id = articles.id
          AND cc.status = 'active'
      ) AS comments_count
    FROM articles
    JOIN users ON users.id = articles.author_id
    WHERE articles.author_id = :profile_user_id
      AND articles.scope = 'profile'
      AND (:include_private = 1 OR articles.status = 'published')
    ORDER BY
      CASE articles.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      COALESCE(articles.published_at, articles.updated_at) DESC
  `).all({
    profile_user_id: profileUserId,
    include_private: includePrivate ? 1 : 0
  });
  return rows.map(articleToApi);
}

function listProfilePodcasts(profileUserId, viewer) {
  const includePrivate = viewer?.role === "admin" || viewer?.id === profileUserId;
  const rows = getDatabase().prepare(`
    SELECT podcast_episodes.*,
      users.name AS author_name,
      (
        SELECT COUNT(*)
        FROM community_comments cc
        WHERE cc.target_type = 'podcast'
          AND cc.target_id = podcast_episodes.id
          AND cc.status = 'active'
      ) AS comments_count
    FROM podcast_episodes
    JOIN users ON users.id = podcast_episodes.author_id
    WHERE podcast_episodes.author_id = :profile_user_id
      AND podcast_episodes.scope = 'profile'
      AND (:include_private = 1 OR podcast_episodes.status = 'published')
    ORDER BY
      CASE podcast_episodes.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      COALESCE(podcast_episodes.published_at, podcast_episodes.updated_at) DESC
  `).all({
    profile_user_id: profileUserId,
    include_private: includePrivate ? 1 : 0
  });
  return rows.map(podcastEpisodeToApi);
}

function publicUserToApi(row) {
  return {
    id: row.id,
    name: row.name || "Usuario",
    role: row.role || "user",
    avatarUrl: row.avatar_url || "",
    bio: row.bio || "",
    createdAt: row.created_at || "",
    isFavorite: Boolean(row.is_favorite),
    listeningCount: Number(row.listening_count || 0),
    albumCount: Number(row.album_count || 0),
    reviewCount: Number(row.review_count || 0)
  };
}

function listProfileBubbles(profileUserId, viewer) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      b.*,
      creator.name AS creator_name,
      viewer_member.role AS my_role,
      viewer_member.status AS my_status,
      profile_member.role AS profile_role,
      (SELECT COUNT(*) FROM bubble_members WHERE bubble_id = b.id AND status = 'active') AS member_count,
      (SELECT COUNT(*) FROM bubble_posts WHERE bubble_id = b.id AND status = 'active') AS post_count
    FROM bubbles b
    JOIN users creator ON creator.id = b.created_by
    LEFT JOIN bubble_members viewer_member ON viewer_member.bubble_id = b.id AND viewer_member.user_id = :viewer_id
    LEFT JOIN bubble_members profile_member ON profile_member.bubble_id = b.id AND profile_member.user_id = :profile_user_id AND profile_member.status = 'active'
    WHERE b.status = 'active'
      AND (
        b.created_by = :profile_user_id
        OR profile_member.id IS NOT NULL
      )
      AND (
        :is_admin = 1
        OR b.visibility IN ('public', 'restricted')
        OR viewer_member.status = 'active'
        OR b.created_by = :viewer_id
      )
    ORDER BY b.created_at DESC
  `).all({
    profile_user_id: profileUserId,
    viewer_id: viewer.id,
    is_admin: viewer.role === "admin" ? 1 : 0
  });

  const owned = [];
  const member = [];
  for (const row of rows) {
    const item = bubbleToApi(row);
    if (row.created_by === profileUserId) owned.push(item);
    else member.push(item);
  }
  return { owned, member };
}

function listUserCatalog(userId) {
  return getDatabase().prepare(`
    SELECT *
    FROM catalog_albums
    WHERE user_id = :user_id
      AND is_active = 1
    ORDER BY created_at DESC
  `).all({ user_id: userId }).map(sqliteCatalogToLegacy);
}

function listUserListeningLogs(userId) {
  return getDatabase().prepare(`
    SELECT
      logs.*,
      albums.id AS catalog_id,
      albums.album,
      albums.artist,
      albums.release_year,
      albums.decade AS album_decade,
      albums.cover_url
    FROM listening_logs logs
    JOIN catalog_albums albums ON albums.id = logs.album_id
    WHERE logs.user_id = :user_id
    ORDER BY logs.listened_at DESC, logs.created_at DESC
  `).all({ user_id: userId }).map(sqliteLogToLegacy);
}

function readLists() {
  const row = getDatabase().prepare("SELECT value FROM app_settings WHERE key = 'legacy_lists'").get();
  if (row?.value) {
    try {
      return sanitizeLists(JSON.parse(row.value));
    } catch {
      return sanitizeLists({});
    }
  }
  const legacy = readDb();
  return sanitizeLists(legacy.lists || {});
}

function saveLists(payload) {
  getDatabase().prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('legacy_lists', :value, :updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({
    value: JSON.stringify(sanitizeLists(payload)),
    updated_at: now()
  });
}

function saveCatalogAlbum(userId, payload) {
  const entry = normalizeCatalogEntry(payload);
  if (!entry.album || !entry.artist) {
    throw publicError("Informe álbum e artista.");
  }

  const db = getDatabase();
  const timestamp = now();
  const existing = findExistingCatalogAlbum(db, userId, entry);
  let id = existing?.id || entry.id || randomId("album");
  const idBelongsToAnotherUser = !existing && db.prepare(`
    SELECT id FROM catalog_albums WHERE id = :id AND user_id <> :user_id
  `).get({ id, user_id: userId });
  if (idBelongsToAnotherUser) id = randomId("album");

  db.prepare(`
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
  `).run({
    id,
    user_id: userId,
    spotify_id: entry.spotifyId || "",
    album: entry.album,
    artist: entry.artist,
    release_date: entry.releaseDate || "",
    release_year: entry.releaseYear || null,
    decade: entry.decade || "",
    genre: entry.genre || "",
    subgenre: entry.subgenre || "",
    country: entry.country || "",
    label: entry.label || "",
    tracks: entry.tracks || 0,
    duration_min: entry.durationMin || 0,
    has_physical: entry.hasPhysical || "Não",
    physical_format: entry.physicalFormat || "",
    collection_status: entry.collectionStatus || "",
    cover_url: entry.coverUrl || "",
    spotify_url: entry.spotifyUrl || "",
    observations: entry.observations || "",
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp
  });

  return sqliteCatalogToLegacy(db.prepare("SELECT * FROM catalog_albums WHERE id = :id AND user_id = :user_id").get({ id, user_id: userId }));
}

function findExistingCatalogAlbum(db, userId, entry) {
  if (entry.spotifyId) {
    const bySpotify = db.prepare(`
      SELECT * FROM catalog_albums
      WHERE user_id = :user_id AND spotify_id = :spotify_id
      LIMIT 1
    `).get({ user_id: userId, spotify_id: entry.spotifyId });
    if (bySpotify) return bySpotify;
  }

  return db.prepare(`
    SELECT * FROM catalog_albums
    WHERE user_id = :user_id
      AND lower(album) = lower(:album)
      AND lower(artist) = lower(:artist)
      AND COALESCE(release_year, 0) = COALESCE(:release_year, 0)
    LIMIT 1
  `).get({
    user_id: userId,
    album: entry.album,
    artist: entry.artist,
    release_year: entry.releaseYear || 0
  });
}

function softDeleteCatalogAlbum(userId, id) {
  getDatabase().prepare(`
    UPDATE catalog_albums
    SET is_active = 0, updated_at = :updated_at
    WHERE id = :id AND user_id = :user_id
  `).run({ id, user_id: userId, updated_at: now() });
}

function saveListeningLog(userId, payload) {
  const db = getDatabase();
  const album = db.prepare(`
    SELECT *
    FROM catalog_albums
    WHERE id = :id
      AND user_id = :user_id
      AND is_active = 1
  `).get({ id: payload.catalogId, user_id: userId });

  if (!album) {
    throw publicError("Álbum não encontrado no catálogo do usuário logado.");
  }

  const entry = normalizeLogEntry(payload, [sqliteCatalogToLegacy(album)]);
  const timestamp = now();
  const id = entry.id || randomId("log");

  db.prepare(`
    INSERT INTO listening_logs (
      id, user_id, album_id, listened_at, format, platform, listening_type,
      genre, subgenre, country, tracks_heard, duration_min, rating,
      mood, location, company, favorite, listen_again,
      month, listening_year, week, observations, created_at, updated_at
    )
    VALUES (
      :id, :user_id, :album_id, :listened_at, :format, :platform, :listening_type,
      :genre, :subgenre, :country, :tracks_heard, :duration_min, :rating,
      :mood, :location, :company, :favorite, :listen_again,
      :month, :listening_year, :week, :observations, :created_at, :updated_at
    )
  `).run({
    id,
    user_id: userId,
    album_id: album.id,
    listened_at: entry.date,
    format: entry.format,
    platform: entry.platform,
    listening_type: entry.listeningType,
    genre: entry.genre,
    subgenre: entry.subgenre,
    country: entry.country,
    tracks_heard: entry.tracksHeard,
    duration_min: entry.durationMin,
    rating: normalizeRatingToFive(entry.rating),
    mood: entry.mood,
    location: entry.location,
    company: entry.company,
    favorite: yesNoToInteger(entry.favorite),
    listen_again: yesNoToInteger(entry.listenAgain, true),
    month: entry.month,
    listening_year: entry.listeningYear,
    week: entry.week,
    observations: entry.observations,
    created_at: timestamp,
    updated_at: timestamp
  });

  return listUserListeningLogs(userId).find((item) => item.id === id);
}

function deleteListeningLog(userId, id) {
  getDatabase().prepare("DELETE FROM listening_logs WHERE id = :id AND user_id = :user_id")
    .run({ id, user_id: userId });
}

function sqliteCatalogToLegacy(row) {
  if (!row) return null;
  return {
    id: row.id,
    spotifyId: row.spotify_id || "",
    album: row.album || "",
    artist: row.artist || "",
    releaseDate: row.release_date || "",
    releaseYear: Number(row.release_year || 0),
    decade: row.decade || "",
    genre: row.genre || "",
    subgenre: row.subgenre || "",
    country: row.country || "",
    label: row.label || "",
    tracks: Number(row.tracks || 0),
    durationMin: Number(row.duration_min || 0),
    hasPhysical: row.has_physical || "Não",
    physicalFormat: row.physical_format || "",
    collectionStatus: row.collection_status || "",
    coverUrl: row.cover_url || "",
    spotifyUrl: row.spotify_url || "",
    observations: row.observations || ""
  };
}

function sqliteLogToLegacy(row) {
  return {
    id: row.id,
    date: row.listened_at,
    catalogId: row.album_id || row.catalog_id,
    album: row.album || "",
    artist: row.artist || "",
    releaseYear: Number(row.release_year || 0),
    decade: row.decade || row.album_decade || "",
    genre: row.genre || "",
    subgenre: row.subgenre || "",
    country: row.country || "",
    format: row.format || "",
    platform: row.platform || "",
    listeningType: row.listening_type || "",
    tracksHeard: Number(row.tracks_heard || 0),
    durationMin: Number(row.duration_min || 0),
    rating: Number(row.rating || 0),
    mood: row.mood || "",
    location: row.location || "",
    company: row.company || "",
    favorite: row.favorite ? "Sim" : "Não",
    listenAgain: row.listen_again ? "Sim" : "Não",
    month: row.month || String(row.listened_at || "").slice(0, 7),
    listeningYear: Number(row.listening_year || String(row.listened_at || "").slice(0, 4) || 0),
    week: Number(row.week || 0),
    observations: row.observations || "",
    coverUrl: row.cover_url || ""
  };
}

function normalizeRatingToFive(value) {
  const rating = Number(value || 0);
  if (!Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, rating > 5 ? rating / 2 : rating));
}

function yesNoToInteger(value, defaultValue = false) {
  const text = clean(value).toLowerCase();
  if (!text) return defaultValue ? 1 : 0;
  return text === "sim" ? 1 : 0;
}

function normalizeCatalogEntry(payload) {
  const releaseYear = Number(payload.releaseYear || yearFromDate(payload.releaseDate) || 0);
  const tracks = Number(payload.tracks || 0);
  const durationMin = Number(payload.durationMin || 0);
  return {
    id: payload.id || payload.spotifyId || randomId("album"),
    spotifyId: payload.spotifyId || "",
    album: clean(payload.album),
    artist: clean(payload.artist),
    releaseDate: payload.releaseDate || "",
    releaseYear,
    decade: payload.decade || decadeFromYear(releaseYear),
    genre: clean(payload.genre),
    subgenre: clean(payload.subgenre),
    country: clean(payload.country),
    label: clean(payload.label),
    tracks,
    durationMin,
    hasPhysical: payload.hasPhysical || "Não",
    physicalFormat: clean(payload.physicalFormat),
    collectionStatus: clean(payload.collectionStatus),
    coverUrl: payload.coverUrl || "",
    spotifyUrl: payload.spotifyUrl || "",
    observations: clean(payload.observations)
  };
}

function normalizeLogEntry(payload, catalog) {
  const album = catalog.find((item) => item.id === payload.catalogId) || {};
  const date = payload.date || new Date().toISOString().slice(0, 10);
  const releaseYear = Number(payload.releaseYear || album.releaseYear || 0);
  return {
    id: payload.id || randomId("log"),
    date,
    catalogId: payload.catalogId || album.id || "",
    album: clean(payload.album || album.album),
    artist: clean(payload.artist || album.artist),
    releaseYear,
    decade: payload.decade || album.decade || decadeFromYear(releaseYear),
    genre: clean(payload.genre || album.genre),
    subgenre: clean(payload.subgenre || album.subgenre),
    country: clean(payload.country || album.country),
    format: clean(payload.format),
    platform: clean(payload.platform),
    listeningType: clean(payload.listeningType),
    tracksHeard: Number(payload.tracksHeard || album.tracks || 0),
    durationMin: Number(payload.durationMin || album.durationMin || 0),
    rating: Number(payload.rating || 0),
    mood: clean(payload.mood),
    location: clean(payload.location),
    company: clean(payload.company),
    favorite: payload.favorite || "Não",
    listenAgain: payload.listenAgain || "Sim",
    month: date.slice(0, 7),
    listeningYear: Number(date.slice(0, 4)),
    week: weekNumber(date),
    observations: clean(payload.observations)
  };
}

function sanitizeLists(input) {
  const defaults = {
    genres: [],
    formats: [],
    platforms: [],
    listeningTypes: [],
    moods: [],
    locations: [],
    companies: [],
    yesNo: ["Sim", "Não"]
  };
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const values = Array.isArray(input[key]) ? input[key] : fallback;
    return [key, [...new Set(values.map(clean).filter(Boolean))]];
  }));
}

async function spotifySearch(query, limit = 10, market = "") {
  const token = await getSpotifyToken();
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("type", "album");
  searchUrl.searchParams.set("limit", String(limit));
  searchUrl.searchParams.set("q", query);
  if (market) searchUrl.searchParams.set("market", market);

  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Spotify search falhou: ${response.status} ${detail}`);
    error.publicMessage = spotifyErrorMessage(response.status, detail);
    throw error;
  }
  const data = await response.json();
  const albums = data.albums?.items || [];

  return Promise.all(albums.map(async (album) => {
    const detail = await spotifyAlbum(album.id, token);
    const genreData = await spotifyArtistGenres(detail || album, token);
    return spotifyToCatalog(detail || album, genreData);
  }));
}

function readNewsReleases({ limit, cursor = 0 }) {
  ensureNewsCacheSeeded();
  const results = listNewsReleases(limit * 3);
  return {
    results: rotatingNewsResults(results, cursor, limit),
    nextCursor: results.length ? (cursor + limit) % results.length : 0,
    cached: true,
    refreshed: false,
    cooldown: false,
    rateLimited: spotifyRateLimitedUntil > Date.now()
  };
}

async function refreshNewsReleases({ limit, cursor = 0 }) {
  ensureNewsCacheSeeded();

  const cooldownUntil = Number(readSetting("news_refresh_cooldown_until") || 0);
  if (cooldownUntil > Date.now()) {
    return {
      ...readNewsReleases({ limit, cursor }),
      cooldown: true,
      message: "News usando cache. Aguarde alguns instantes para atualizar novamente."
    };
  }

  setSetting("news_refresh_cooldown_until", String(Date.now() + NEWS_REFRESH_COOLDOWN_MS));

  const artistNames = randomSample(NEWS_ARTISTS, Math.min(NEWS_ARTISTS.length, 3));
  let freshResults = [];
  let rateLimited = false;

  for (const artistName of artistNames) {
    const releases = await spotifyArtistReleases(artistName, 1).catch((error) => {
      if (error.rateLimited) rateLimited = true;
      return [];
    });
    freshResults.push(...releases);
  }

  freshResults = uniqueAlbums(freshResults)
    .sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")))
    .slice(0, 6);

  if (freshResults.length) {
    saveNewsReleases(freshResults);
  }

  const cache = listNewsReleases(80);

  return {
    results: rotatingNewsResults(cache, cursor, limit),
    nextCursor: cache.length ? (cursor + limit) % cache.length : 0,
    artists: artistNames,
    cached: !freshResults.length,
    refreshed: Boolean(freshResults.length),
    rateLimited
  };
}

function refreshNewsCacheInBackground() {
  if (newsRefreshInFlight) return;
  newsRefreshInFlight = true;
  const artistNames = randomSample(NEWS_ARTISTS, 2);
  Promise.all(artistNames.map((artistName) => spotifyArtistReleases(artistName, 1).catch(() => [])))
    .then((groups) => {
      const results = uniqueAlbums(groups.flat()).filter(Boolean);
      if (results.length) saveNewsReleases(results);
    })
    .finally(() => {
      newsRefreshInFlight = false;
    });
}

function ensureNewsCacheSeeded() {
  const count = getDatabase().prepare("SELECT COUNT(*) AS total FROM news_releases").get().total;
  if (count < 6) {
    const legacy = readNewsCacheFile(80);
    saveNewsReleases([...(legacy.length ? legacy : []), ...seededNewsReleases(80)]);
  }
}

function listNewsReleases(limit = 80) {
  ensureNewsCacheSeededIfNeededOnly();
  return getDatabase().prepare(`
    SELECT *
    FROM news_releases
    ORDER BY release_date DESC, updated_at DESC
    LIMIT :limit
  `).all({ limit }).map(sqliteNewsToCatalog);
}

function ensureNewsCacheSeededIfNeededOnly() {
  const count = getDatabase().prepare("SELECT COUNT(*) AS total FROM news_releases").get().total;
  if (count < 6) saveNewsReleases(seededNewsReleases(80));
}

function saveNewsReleases(results) {
  const db = getDatabase();
  const timestamp = now();
  const statement = db.prepare(`
    INSERT INTO news_releases (
      id, external_id, title, artist, release_date, release_year,
      cover_url, total_tracks, external_url, source, payload_json,
      fetched_at, created_at, updated_at
    )
    VALUES (
      :id, :external_id, :title, :artist, :release_date, :release_year,
      :cover_url, :total_tracks, :external_url, 'spotify', :payload_json,
      :fetched_at, :created_at, :updated_at
    )
    ON CONFLICT(source, external_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      release_date = excluded.release_date,
      release_year = excluded.release_year,
      cover_url = excluded.cover_url,
      total_tracks = excluded.total_tracks,
      external_url = excluded.external_url,
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at
  `);

  for (const item of uniqueAlbums(results).filter(Boolean)) {
    const externalId = item.spotifyId || item.id;
    if (!externalId) continue;
    statement.run({
      id: `news_${externalId}`,
      external_id: externalId,
      title: item.album || "",
      artist: item.artist || "",
      release_date: item.releaseDate || "",
      release_year: item.releaseYear || yearFromDate(item.releaseDate),
      cover_url: item.coverUrl || "",
      total_tracks: Number(item.tracks || 0),
      external_url: item.spotifyUrl || "",
      payload_json: JSON.stringify(item),
      fetched_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    });
  }
}

function sqliteNewsToCatalog(row) {
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
  return normalizeCatalogEntry({
    ...payload,
    id: row.external_id,
    spotifyId: row.external_id,
    album: row.title,
    artist: row.artist,
    releaseDate: row.release_date || payload.releaseDate || "",
    releaseYear: row.release_year || payload.releaseYear || yearFromDate(row.release_date),
    tracks: row.total_tracks || payload.tracks || 0,
    coverUrl: row.cover_url || payload.coverUrl || "",
    spotifyUrl: row.external_url || payload.spotifyUrl || "",
    observations: payload.observations || "Importado do Spotify"
  });
}

function readCommunityNews({ limit, cursor = 0 }) {
  ensureCommunityNewsCacheSeeded();
  const results = listCommunityNews(limit * 3);
  return {
    results: rotatingNewsResults(results, cursor, limit),
    nextCursor: results.length ? (cursor + limit) % results.length : 0,
    cached: true,
    refreshed: false,
    source: TMDQA_SOURCE_NAME,
    message: results.length ? "Exibindo noticias salvas do TMDQA." : ""
  };
}

async function refreshCommunityNews({ limit, cursor = 0 }) {
  let freshResults = [];
  try {
    freshResults = await fetchTmdqaNews();
    if (freshResults.length) saveCommunityNews(freshResults);
  } catch (error) {
    console.warn("Falha ao atualizar RSS TMDQA:", error.message);
  }

  const cache = listCommunityNews(80);
  return {
    results: rotatingNewsResults(cache, 0, limit),
    nextCursor: cache.length ? limit % cache.length : 0,
    source: TMDQA_SOURCE_NAME,
    cached: !freshResults.length,
    refreshed: Boolean(freshResults.length),
    message: freshResults.length ? "Noticias atualizadas pelo RSS do TMDQA." : "Nao foi possivel atualizar agora. Exibindo cache salvo."
  };
}

function ensureCommunityNewsCacheSeeded() {
  const count = getDatabase().prepare("SELECT COUNT(*) AS total FROM community_news_cache").get().total;
  if (!count) saveCommunityNews(seedCommunityNews());
}

function listCommunityNews(limit = 80) {
  return getDatabase().prepare(`
    SELECT *
    FROM community_news_cache
    ORDER BY published_at DESC, updated_at DESC
    LIMIT :limit
  `).all({ limit }).map(sqliteCommunityNewsToApi);
}

function saveCommunityNews(results) {
  const db = getDatabase();
  const timestamp = now();
  const statement = db.prepare(`
    INSERT INTO community_news_cache (
      id, external_id, title, summary, content, author, source_name, source_url,
      image_url, published_at, payload_json, fetched_at, created_at, updated_at
    )
    VALUES (
      :id, :external_id, :title, :summary, :content, :author, :source_name, :source_url,
      :image_url, :published_at, :payload_json, :fetched_at, :created_at, :updated_at
    )
    ON CONFLICT(source_name, external_id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      content = excluded.content,
      author = excluded.author,
      source_url = excluded.source_url,
      image_url = excluded.image_url,
      published_at = excluded.published_at,
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at
  `);

  for (const item of uniqueCommunityNews(results).filter((entry) => entry.title && entry.url)) {
    const externalId = item.id || item.url;
    statement.run({
      id: `cnews_${hashShort(externalId)}`,
      external_id: externalId,
      title: item.title,
      summary: item.summary || "",
      content: item.content || "",
      author: item.author || "",
      source_name: item.sourceName || TMDQA_SOURCE_NAME,
      source_url: item.url,
      image_url: item.imageUrl || "",
      published_at: item.publishedAt || timestamp,
      payload_json: JSON.stringify(item),
      fetched_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    });
  }
}

async function fetchTmdqaNews() {
  const response = await fetch(TMDQA_RSS_URL, {
    headers: {
      "User-Agent": "MyAlbums/1.0 (+local-community-cache)",
      Accept: "application/rss+xml, application/xml, text/xml"
    }
  });
  if (!response.ok) throw new Error(`TMDQA RSS falhou: ${response.status}`);
  const xml = await response.text();
  return parseRssItems(xml).slice(0, 30);
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const itemXml = match[0];
    const title = cleanXmlText(xmlTagValue(itemXml, "title"));
    const url = cleanXmlText(xmlTagValue(itemXml, "link"));
    const description = cleanTmdqaText(cleanHtml(cleanXmlText(xmlTagValue(itemXml, "description"))));
    const encodedContent = cleanXmlText(xmlTagValue(itemXml, "content:encoded"));
    const content = cleanTmdqaText(cleanHtml(encodedContent || description));
    const publishedAt = dateToIso(cleanXmlText(xmlTagValue(itemXml, "pubDate")));
    const creator = cleanXmlText(xmlTagValue(itemXml, "dc:creator"));
    const guid = cleanXmlText(xmlTagValue(itemXml, "guid")) || url;
    const imageUrl = rssImageUrl(itemXml, encodedContent || description);
    return {
      id: guid,
      title,
      summary: shortText(description || content, 220),
      content,
      author: creator,
      sourceName: TMDQA_SOURCE_NAME,
      url,
      imageUrl,
      publishedAt
    };
  }).filter((item) => item.title && item.url);
}

function xmlTagValue(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? unwrapCdata(match[1].trim()) : "";
}

function rssImageUrl(itemXml, html = "") {
  const media = itemXml.match(/<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i)
    || itemXml.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["'][^>]*>/i)
    || itemXml.match(/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*\btype=["']image\/[^"']+["'][^>]*>/i)
    || itemXml.match(/<enclosure\b[^>]*\btype=["']image\/[^"']+["'][^>]*\burl=["']([^"']+)["'][^>]*>/i);
  if (media?.[1]) return normalizeNewsImageUrl(decodeXmlEntities(media[1]));
  const image = String(html || "").match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return image?.[1] ? normalizeNewsImageUrl(decodeXmlEntities(image[1])) : "";
}

function normalizeNewsImageUrl(value) {
  let url = String(value || "").trim();
  if (!url) return "";
  url = decodeXmlEntities(url);
  if (url.startsWith("//")) url = `https:${url}`;
  if (/^(www|uploads)\.tenhomaisdiscosqueamigos\.com\//i.test(url)) url = `https://${url}`;
  url = url
    .replace(/^https?:\/\/www\.tenhomaisdiscosqueamigos\.com\/www\.tenhomaisdiscosqueamigos\.com\//i, "https://www.tenhomaisdiscosqueamigos.com/")
    .replace(/^https?:\/\/www\.tenhomaisdiscosqueamigos\.com\/uploads\.tenhomaisdiscosqueamigos\.com\//i, "https://uploads.tenhomaisdiscosqueamigos.com/");
  const youtube = url.match(/youtube\.com\/embed\/([a-z0-9_-]+)/i) || url.match(/youtu\.be\/([a-z0-9_-]+)/i);
  if (youtube?.[1]) return `https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`;
  if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url)) return url;
  return "";
}

function unwrapCdata(value) {
  return String(value || "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function cleanXmlText(value) {
  return decodeXmlEntities(unwrapCdata(value).trim());
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanHtml(value) {
  return decodeXmlEntities(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function cleanTmdqaText(value) {
  return String(value || "")
    .replace(/\s*O post .+? apareceu primeiro em TMDQA!\s*\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortText(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}...`;
}

function dateToIso(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? now() : new Date(parsed).toISOString();
}

function sqliteCommunityNewsToApi(row) {
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
  return {
    id: row.external_id,
    title: row.title,
    summary: row.summary || payload.summary || "",
    content: row.content || payload.content || "",
    author: row.author || payload.author || "",
    sourceName: row.source_name || TMDQA_SOURCE_NAME,
    url: row.source_url,
    imageUrl: normalizeNewsImageUrl(row.image_url || payload.imageUrl || ""),
    publishedAt: row.published_at || payload.publishedAt || "",
    fetchedAt: row.fetched_at || ""
  };
}

function uniqueCommunityNews(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeText(item.url || item.id || item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashShort(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 24);
}

function seedCommunityNews() {
  const timestamp = now();
  return [
    {
      id: "tmdqa-seed-home",
      title: "Tenho Mais Discos Que Amigos! no MyAlbums",
      summary: "As noticias musicais da Comunidade agora usam o RSS editorial do TMDQA como fonte principal.",
      content: "Clique em Atualizar News como admin para buscar as ultimas publicacoes do Tenho Mais Discos Que Amigos! e manter a Comunidade com noticias recentes.",
      author: "MyAlbums",
      sourceName: TMDQA_SOURCE_NAME,
      url: "https://www.tenhomaisdiscosqueamigos.com/",
      imageUrl: "",
      publishedAt: timestamp
    }
  ];
}

function rotatingNewsResults(results, cursor, limit) {
  if (!results.length) return [];
  if (results.length <= limit) return results;
  const start = Math.max(Number(cursor || 0), 0) % results.length;
  return rotatingSlice(results, start, Math.min(limit, results.length));
}

function readSetting(key) {
  const row = getDatabase().prepare("SELECT value FROM app_settings WHERE key = :key").get({ key });
  return row?.value || "";
}

function setSetting(key, value) {
  getDatabase().prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (:key, :value, :updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({ key, value, updated_at: now() });
}

async function spotifyArtistReleases(artistName, limit = 4) {
  const cacheKey = normalizeText(artistName);
  const cached = newsReleaseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.releases.slice(0, limit);
  if (spotifyRateLimitedUntil > Date.now()) throw spotifyRateLimitError();

  const token = await getSpotifyToken();
  const releases = await spotifySearchLatestByArtist(artistName, token, limit);

  newsReleaseCache.set(cacheKey, {
    releases,
    expiresAt: Date.now() + NEWS_RELEASE_CACHE_MS
  });

  return releases;
}

async function spotifySearchLatestByArtist(artistName, token, limit) {
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("type", "album");
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("market", "BR");
  searchUrl.searchParams.set("q", `artist:${spotifyQueryValue(artistName)}`);

  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 429) throw spotifyRateLimitError(response);
  if (!response.ok) return [];

  const data = await response.json();
  const albums = uniqueRawAlbums(data.albums?.items || [])
    .filter((album) => (album.artists || []).some((artist) => sameArtistName(artist.name, artistName)))
    .sort((a, b) => String(b.release_date || "").localeCompare(String(a.release_date || "")))
    .slice(0, limit);

  return uniqueAlbums(albums.map((album) => spotifyToCatalog(album, inferGenresFromMetadata(album.name, artistName))));
}

async function spotifyArtistAlbumReleases(artist, token, limit) {
  const releasesUrl = new URL(`https://api.spotify.com/v1/artists/${artist.id}/albums`);
  releasesUrl.searchParams.set("include_groups", "album,single,compilation");
  releasesUrl.searchParams.set("market", "BR");
  releasesUrl.searchParams.set("limit", "10");

  const response = await fetch(releasesUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 429) throw spotifyRateLimitError(response);
  if (!response.ok) return [];

  const data = await response.json();
  const albums = uniqueRawAlbums(data.items || [])
    .filter((album) => (album.artists || []).some((item) => sameArtistName(item.name, artist.name)))
    .sort((a, b) => String(b.release_date || "").localeCompare(String(a.release_date || "")))
    .slice(0, Math.max(limit, 3));

  return uniqueAlbums(albums.map((album) => spotifyToCatalog(album, inferGenresFromMetadata(album.name, artist.name))))
    .sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")))
    .slice(0, limit);
}

function uniqueRawAlbums(albums) {
  const seen = new Set();
  return albums.filter((album) => {
    const key = album.id || `${normalizeText(album.name)}-${album.release_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readNewsCacheFile(limit) {
  if (!fs.existsSync(NEWS_CACHE_PATH)) return seededNewsReleases(limit);
  try {
    const payload = JSON.parse(fs.readFileSync(NEWS_CACHE_PATH, "utf8"));
    const results = Array.isArray(payload.results) ? payload.results : [];
    return results.length
      ? randomSample(results, Math.min(limit, results.length))
      : seededNewsReleases(limit);
  } catch {
    return seededNewsReleases(limit);
  }
}

function writeNewsCache(results) {
  fs.mkdirSync(path.dirname(NEWS_CACHE_PATH), { recursive: true });
  const merged = uniqueAlbums([...results, ...readNewsCacheFile(80)])
    .sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")))
    .slice(0, 80);
  fs.writeFileSync(NEWS_CACHE_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), results: merged }, null, 2));
}

function seededNewsReleases(limit) {
  return [
    ["1nk0CV2agKlG3G0dV4vyqK", "In The Stars", "The Rolling Stones", "2026-05-05", 2, "https://i.scdn.co/image/ab67616d0000b273ce029930e121e2884a5c1d43"],
    ["7aVV2F19bvzh2Z9onHrKBg", "Who's Breakthroughs", "The Who", "2026-04-03", 7, "https://i.scdn.co/image/ab67616d0000b273678ef61e9188f3c671bbce0c"],
    ["3wzh9sJLntyUgXBtLcjT20", "Aerosmith (Legendary Expanded Edition)", "Aerosmith", "2026-03-20", 33, "https://i.scdn.co/image/ab67616d0000b273d349d927cee03b0c405761df"],
    ["7u9D3mUybY1sCmwWzo1vGA", "Why Can't This Be Love (Extended Version) [2026 Remaster]", "Van Halen", "2026-03-04", 2, "https://i.scdn.co/image/ab67616d0000b273b46c22cd6e69ccbb6b78f91f"],
    ["1UsAKTlXV4bOhWdO72es7V", "Lynyrd Skynyrd: Free As A Bird", "Lynyrd Skynyrd", "2026-02-27", 12, "https://i.scdn.co/image/ab67616d0000b2733ffdfd9f60a31b4f215db660"],
    ["00q7zRjca6khksgPKQoi5F", "Arrogant Boy", "Deep Purple", "2026-05-13", 1, "https://i.scdn.co/image/ab67616d0000b273bd111fcd1c01330560145ee3"]
  ].map(([spotifyId, album, artist, releaseDate, tracks, coverUrl]) => ({
    id: `seed-${spotifyId}`,
    spotifyId,
    album,
    artist,
    releaseDate,
    releaseYear: yearFromDate(releaseDate),
    decade: decadeFromYear(yearFromDate(releaseDate)),
    genre: "Rock",
    subgenre: "",
    country: "",
    label: "",
    tracks,
    durationMin: 0,
    hasPhysical: "Não",
    physicalFormat: "",
    collectionStatus: "",
    coverUrl,
    spotifyUrl: `https://open.spotify.com/album/${spotifyId}`,
    observations: "Importado do Spotify"
  })).slice(0, limit);
}

async function spotifyFindArtist(artistName, token) {
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("type", "artist");
  searchUrl.searchParams.set("limit", "5");
  searchUrl.searchParams.set("q", `artist:${spotifyQueryValue(artistName)}`);
  searchUrl.searchParams.set("market", "BR");

  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 429) throw spotifyRateLimitError(response);
  if (!response.ok) return null;

  const data = await response.json();
  const artists = data.artists?.items || [];
  return artists.find((artist) => sameArtistName(artist.name, artistName)) || null;
}

function spotifyRateLimitError(response) {
  const retryAfter = response?.headers?.get?.("retry-after");
  const waitSeconds = Math.max(Number(retryAfter || 60), 20);
  spotifyRateLimitedUntil = Date.now() + waitSeconds * 1000;
  const error = new Error(`Spotify rate limit${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
  error.rateLimited = true;
  error.publicMessage = "Spotify limitou temporariamente as buscas. Tente atualizar novamente em alguns instantes.";
  return error;
}

function sameArtistName(first, second) {
  return comparableArtistName(first) === comparableArtistName(second);
}

function albumArtistMatches(albumArtist, targetArtist) {
  return clean(albumArtist)
    .split(",")
    .some((artist) => sameArtistName(artist, targetArtist));
}

function comparableArtistName(value) {
  return normalizeText(value).replace(/^(the|os|a)\s+/, "");
}

async function spotifyBrowseNewReleases(token, limit) {
  const releasesUrl = new URL("https://api.spotify.com/v1/browse/new-releases");
  releasesUrl.searchParams.set("country", "BR");
  releasesUrl.searchParams.set("limit", String(Math.min(limit || 12, 20)));

  const response = await fetch(releasesUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return [];

  const data = await response.json();
  const albums = data.albums?.items || [];
  return Promise.all(albums.map(async (album) => {
    const detail = await spotifyAlbum(album.id, token);
    const genreData = await spotifyArtistGenres(detail || album, token);
    return spotifyToCatalog(detail || album, genreData);
  }));
}

function uniqueAlbums(albums) {
  const seen = new Set();
  return albums.filter((album) => {
    const key = album.spotifyId || `${normalizeText(album.album)}-${normalizeText(album.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rotatingSlice(items, start, count) {
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

function randomSample(items, count) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

function buildSpotifyQuery({ artist, album, fallback }) {
  const parts = [];
  if (clean(album)) parts.push(`album:${spotifyQueryValue(album)}`);
  if (clean(artist)) parts.push(`artist:${spotifyQueryValue(artist)}`);
  return parts.length ? parts.join(" ") : clean(fallback);
}

function spotifyQueryValue(value) {
  const normalized = clean(value).replace(/"/g, "");
  return /\s/.test(normalized) ? `"${normalized}"` : normalized;
}

async function spotifyAlbum(id, token) {
  const response = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

async function spotifyArtistGenres(album, token) {
  const artistIds = (album.artists || []).map((artist) => artist.id).filter(Boolean).slice(0, 3);
  if (!artistIds.length) return [];

  const results = await Promise.all(artistIds.map(async (id) => {
    const response = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return [];
    const artist = await response.json();
    return artist.genres || [];
  }));

  return [...new Set(results.flat().map(titleCase).filter(Boolean))];
}

async function getSpotifyToken() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    const error = new Error("Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no ambiente ou em .env.");
    error.publicMessage = error.message;
    throw error;
  }
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 30000) return spotifyToken.accessToken;

  const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Autenticacao Spotify falhou: ${response.status} ${detail}`);
    error.publicMessage = spotifyErrorMessage(response.status, detail);
    throw error;
  }
  const data = await response.json();
  spotifyToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };
  return spotifyToken.accessToken;
}

function spotifyToCatalog(album, genreData = []) {
  const durationMs = (album.tracks?.items || []).reduce((sum, track) => sum + (track.duration_ms || 0), 0);
  const releaseYear = yearFromDate(album.release_date);
  const artists = (album.artists || []).map((artist) => artist.name).join(", ");
  const inferredGenres = genreData.length ? genreData : inferGenresFromMetadata(album.name, artists);
  return normalizeCatalogEntry({
    id: album.id,
    spotifyId: album.id,
    album: album.name,
    artist: artists,
    releaseDate: album.release_date || "",
    releaseYear,
    decade: decadeFromYear(releaseYear),
    genre: inferredGenres[0] || "",
    subgenre: inferredGenres.slice(1, 5).join(", "),
    label: album.label || "",
    tracks: album.total_tracks || album.tracks?.total || 0,
    durationMin: Math.round(durationMs / 60000),
    coverUrl: album.images?.[0]?.url || "",
    spotifyUrl: album.external_urls?.spotify || "",
    observations: "Importado do Spotify"
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Payload muito grande."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON invalido."));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function clean(value) {
  return String(value || "").trim();
}

function titleCase(value) {
  return clean(value).replace(/\p{L}[\p{L}\p{M}'-]*/gu, (word) => {
    const lower = word.toLocaleLowerCase("pt-BR");
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
  });
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function inferGenresFromMetadata(albumName, artistName) {
  const text = `${albumName || ""} ${artistName || ""}`.toLocaleLowerCase("pt-BR");
  const rules = [
    [["stevie wonder", "marvin gaye", "aretha franklin", "curtis mayfield", "otis redding"], ["Soul", "R&B", "Funk"]],
    [["the beatles", "rolling stones", "led zeppelin", "pink floyd", "queen"], ["Rock", "Classic Rock"]],
    [["miles davis", "john coltrane", "charles mingus", "herbie hancock"], ["Jazz"]],
    [["milton nascimento", "caetano veloso", "gilberto gil", "jorge ben", "chico buarque"], ["MPB"]],
    [["metallica", "black sabbath", "iron maiden", "slayer"], ["Metal"]],
    [["daft punk", "kraftwerk", "aphex twin", "depeche mode"], ["Eletrônica"]],
    [["bob marley", "peter tosh", "toots and the maytals"], ["Reggae"]],
    [["kendrick lamar", "nas", "jay-z", "public enemy", "wu-tang"], ["Hip Hop"]],
    [["ramones", "the clash", "sex pistols"], ["Punk"]],
    [["bossa", "joão gilberto", "tom jobim", "nara leão"], ["Bossa Nova", "MPB"]]
  ];
  const match = rules.find(([needles]) => needles.some((needle) => text.includes(needle)));
  return match ? match[1] : [];
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function yearFromDate(date) {
  const match = String(date || "").match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function decadeFromYear(year) {
  const numericYear = Number(year || 0);
  return numericYear ? `${Math.floor(numericYear / 10) * 10}s` : "";
}

function weekNumber(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const pastDays = Math.floor((date - firstDay) / 86400000);
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function spotifyErrorMessage(status, detail) {
  if (String(detail).includes("Active premium subscription required")) {
    return "O Spotify aceitou as credenciais, mas bloqueou a Web API: o dono do app precisa ter Spotify Premium ativo. Depois de ativar/regularizar, pode levar algumas horas para liberar.";
  }
  if (status === 401) {
    return "Credenciais do Spotify invalidas. Confira SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no arquivo .env.";
  }
  if (status === 403) {
    return `Spotify bloqueou a requisição: ${detail || "permissão negada."}`;
  }
  return `Spotify retornou erro ${status}: ${detail || "sem detalhe."}`;
}
