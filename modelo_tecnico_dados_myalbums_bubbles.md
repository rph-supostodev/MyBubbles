# Modelo Técnico de Dados — MyAlbums Bubbles

## 1. Objetivo

Este documento define o modelo técnico de dados da nova versão do **MyAlbums**, agora orientada a multiusuário, comunidade, News global, Newsletter editorial e Bubbles.

A versão atual pessoal foi preservada como backup. Este modelo deve orientar a implementação dentro da nova base:

```text
C:\Users\raphe\OneDrive\Documentos\MyAlbuns - Bubbles
```

## 2. Decisões Técnicas

| Tema | Decisão |
|---|---|
| Banco inicial | SQLite |
| Banco futuro | PostgreSQL |
| Autenticação inicial | Login local com sessão via cookie |
| Senha | Hash com salt, nunca texto puro |
| Dados pessoais | Sempre vinculados a `user_id` |
| News | Cache global compartilhado |
| Newsletter | Conteúdo editorial gerenciado por admin |
| Bubbles inicial | Comunidades com membros, posts e comentários |
| Exclusão de álbum | Exclusão lógica |
| Nota | 0 a 5 estrelas, com meia estrela |

## 3. Visão Geral das Entidades

```text
users
sessions
catalog_albums
listening_logs
news_releases
articles
bubbles
bubble_members
bubble_posts
bubble_comments
app_settings
```

## 4. Relacionamentos Principais

```text
users 1:N sessions
users 1:N catalog_albums
users 1:N listening_logs
catalog_albums 1:N listening_logs

users 1:N articles

users N:N bubbles por bubble_members
bubbles 1:N bubble_posts
bubble_posts 1:N bubble_comments
users 1:N bubble_posts
users 1:N bubble_comments

news_releases é global
news_releases pode ser importado para catalog_albums
```

## 5. Tabela `users`

Armazena os usuários do sistema.

```sql
CREATE TABLE users (
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);
```

### Regras

- `email` deve ser único.
- `role = admin` acessa área administrativa.
- `role = user` acessa somente dados próprios e áreas públicas.
- `status = inactive` bloqueia login.
- Senha deve ser armazenada em `password_hash`.

## 6. Tabela `sessions`

Armazena sessões locais autenticadas.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Regras

- O cookie deve carregar apenas o token bruto.
- O banco deve guardar `token_hash`.
- Toda rota autenticada valida sessão, expiração, usuário ativo e permissões.

## 7. Tabela `catalog_albums`

Catálogo pessoal de cada usuário.

```sql
CREATE TABLE catalog_albums (
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
  cover_url TEXT,
  spotify_url TEXT,
  observations TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Índices

```sql
CREATE INDEX idx_catalog_user ON catalog_albums(user_id);
CREATE INDEX idx_catalog_spotify ON catalog_albums(user_id, spotify_id);
CREATE INDEX idx_catalog_active ON catalog_albums(user_id, is_active);
```

### Regras

- Cada álbum pertence a um único usuário.
- Usuário só vê álbuns com seu `user_id`.
- Exclusão deve ser lógica quando houver audições vinculadas.
- Duplicidade deve ser evitada por usuário usando `spotify_id` ou `artist + album + release_year`.

## 8. Tabela `listening_logs`

Registros de audição do usuário.

```sql
CREATE TABLE listening_logs (
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
  favorite INTEGER NOT NULL DEFAULT 0,
  listen_again INTEGER NOT NULL DEFAULT 1,
  month TEXT,
  listening_year INTEGER,
  week INTEGER,
  observations TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (album_id) REFERENCES catalog_albums(id)
);
```

### Índices

```sql
CREATE INDEX idx_logs_user ON listening_logs(user_id);
CREATE INDEX idx_logs_album ON listening_logs(album_id);
CREATE INDEX idx_logs_date ON listening_logs(user_id, listened_at);
CREATE INDEX idx_logs_month ON listening_logs(user_id, month);
```

### Regras

- Audição pertence ao usuário logado.
- `album_id` deve pertencer ao mesmo `user_id`.
- `listened_at` é obrigatório.
- Nota válida: `0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5`.
- Diário e estatísticas sempre filtram por `user_id`.

## 9. Tabela `news_releases`

Cache global de lançamentos musicais.

```sql
CREATE TABLE news_releases (
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
```

### Índices

```sql
CREATE INDEX idx_news_release_date ON news_releases(release_date);
CREATE INDEX idx_news_artist ON news_releases(artist);
```

### Regras

- News é global para todos.
- Atualização da News não pertence a usuário.
- A tela deve retornar cache local imediatamente.
- Atualizações externas devem ser controladas para evitar rate limit.
- Ao importar, cria-se uma cópia no `catalog_albums` do usuário logado.

## 10. Tabela `articles`

Newsletter editorial gerenciada por administrador.

```sql
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT,
  content TEXT NOT NULL,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
```

### Regras

- Apenas admin cria, edita, publica, arquiva ou exclui artigo.
- Usuário comum vê apenas `status = published`.
- Conteúdo pode ser Markdown.

## 11. Tabela `bubbles`

Comunidades musicais.

```sql
CREATE TABLE bubbles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'restricted')),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### Regras

- `public`: todos visualizam, membros interagem.
- `private`: somente membros visualizam e interagem.
- `restricted`: todos visualizam, apenas membros interagem.
- Admin visualiza e modera todas.

## 12. Tabela `bubble_members`

Relação muitos-para-muitos entre usuários e Bubbles.

```sql
CREATE TABLE bubble_members (
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
```

### Regras

- Membro ativo pode postar e comentar.
- Não membro só visualiza Bubbles públicas ou restritas.
- Membro bloqueado não interage.
- Owner e moderador podem ter permissões adicionais.

## 13. Tabela `bubble_posts`

Posts dentro de uma Bubble.

```sql
CREATE TABLE bubble_posts (
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
```

### Regras

- Apenas membro ativo pode postar.
- Admin, owner e moderador podem ocultar/remover.
- `album_id` é opcional.

## 14. Tabela `bubble_comments`

Comentários e respostas em posts.

```sql
CREATE TABLE bubble_comments (
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
```

### Regras

- Apenas membro ativo da Bubble pode comentar.
- Comentário pode ser resposta de outro comentário.
- Admin, owner e moderador podem ocultar/remover.

## 15. Tabela `app_settings`

Configurações globais do sistema.

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
```

### Uso inicial

```text
news_last_refresh_at
news_rate_limited_until
spotify_artist_cursor
```

## 16. Seeds Iniciais

### Admin

```text
name: Administrador
email: admin@myalbums.com
role: admin
status: active
```

### Usuário principal

```text
name: Raphael
email: raphael@myalbums.local
role: user
status: active
```

As senhas devem ser definidas no momento da criação do seed e armazenadas com hash.

## 17. Estratégia de Migração dos Dados Atuais

O arquivo atual `data/db.json` contém:

```text
catalog
listeningLog
lists
```

### Migração do catálogo

Cada item em `catalog` deve virar um registro em `catalog_albums`.

Mapeamento principal:

| JSON atual | SQLite novo |
|---|---|
| id | id |
| spotifyId | spotify_id |
| album | album |
| artist | artist |
| releaseDate | release_date |
| releaseYear | release_year |
| decade | decade |
| genre | genre |
| subgenre | subgenre |
| country | country |
| label | label |
| tracks | tracks |
| durationMin | duration_min |
| hasPhysical | has_physical |
| physicalFormat | physical_format |
| collectionStatus | collection_status |
| coverUrl | cover_url |
| spotifyUrl | spotify_url |
| observations | observations |

Todos os registros migrados recebem `user_id` do usuário principal.

### Migração das audições

Cada item em `listeningLog` deve virar um registro em `listening_logs`.

Mapeamento principal:

| JSON atual | SQLite novo |
|---|---|
| id | id |
| catalogId | album_id |
| date | listened_at |
| format | format |
| platform | platform |
| listeningType | listening_type |
| genre | genre |
| subgenre | subgenre |
| country | country |
| tracksHeard | tracks_heard |
| durationMin | duration_min |
| rating | rating |
| mood | mood |
| location | location |
| company | company |
| favorite | favorite |
| listenAgain | listen_again |
| month | month |
| listeningYear | listening_year |
| week | week |
| observations | observations |

Todos os registros migrados recebem `user_id` do usuário principal.

### Normalizações

- `favorite = "Sim"` vira `1`; demais valores viram `0`.
- `listenAgain = "Sim"` vira `1`; demais valores viram `0`.
- `rating > 5` deve ser convertido para escala 0 a 5 dividindo por 2.
- `is_active = 1` para álbuns migrados.

## 18. Consultas Base

### Catálogo do usuário logado

```sql
SELECT *
FROM catalog_albums
WHERE user_id = ?
  AND is_active = 1
ORDER BY created_at DESC;
```

### Audições do usuário logado

```sql
SELECT logs.*, albums.album, albums.artist, albums.cover_url
FROM listening_logs logs
JOIN catalog_albums albums ON albums.id = logs.album_id
WHERE logs.user_id = ?
ORDER BY logs.listened_at DESC;
```

### Estatísticas do usuário logado

```sql
SELECT
  COUNT(*) AS total_listenings,
  COUNT(DISTINCT album_id) AS unique_albums,
  SUM(duration_min) / 60.0 AS hours,
  AVG(rating) AS avg_rating
FROM listening_logs
WHERE user_id = ?;
```

### Bubbles visíveis para o usuário

```sql
SELECT b.*
FROM bubbles b
LEFT JOIN bubble_members bm
  ON bm.bubble_id = b.id
 AND bm.user_id = ?
 AND bm.status = 'active'
WHERE b.status = 'active'
  AND (
    b.visibility IN ('public', 'restricted')
    OR bm.id IS NOT NULL
  );
```

### Posts de Bubble

```sql
SELECT p.*, u.name AS author_name
FROM bubble_posts p
JOIN users u ON u.id = p.user_id
WHERE p.bubble_id = ?
  AND p.status = 'active'
ORDER BY p.created_at DESC;
```

## 19. Validação de Permissões

Toda rota sensível deve passar por validação no backend.

### Funções recomendadas

```text
requireAuth()
requireAdmin()
requireActiveUser()
canAccessAlbum(userId, albumId)
canEditListeningLog(userId, logId)
canViewBubble(userId, bubbleId)
canPostInBubble(userId, bubbleId)
canModerateBubble(userId, bubbleId)
```

## 20. Rotas Iniciais Recomendadas

### Autenticação

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Usuários

```text
GET    /api/users
POST   /api/users
GET    /api/users/:id
PUT    /api/users/:id
PATCH  /api/users/:id/status
```

### Catálogo

```text
GET    /api/catalog
POST   /api/catalog
PUT    /api/catalog/:id
DELETE /api/catalog/:id
```

### Audições

```text
GET    /api/log
POST   /api/log
PUT    /api/log/:id
DELETE /api/log/:id
```

### News

```text
GET  /api/news/releases
POST /api/news/releases/refresh
POST /api/news/releases/:id/import
```

### Artigos

```text
GET    /api/articles
POST   /api/articles
GET    /api/articles/:slug
PUT    /api/articles/:id
DELETE /api/articles/:id
```

### Bubbles

```text
GET    /api/bubbles
POST   /api/bubbles
GET    /api/bubbles/:id
PUT    /api/bubbles/:id
POST   /api/bubbles/:id/invite
POST   /api/bubbles/:id/join
GET    /api/bubbles/:id/posts
POST   /api/bubbles/:id/posts
POST   /api/posts/:id/comments
DELETE /api/posts/:id
DELETE /api/comments/:id
```

## 21. Ordem de Implementação Recomendada

1. Adicionar SQLite e camada de acesso a dados.
2. Criar schema inicial.
3. Criar seeds de admin e usuário principal.
4. Migrar `data/db.json` para SQLite.
5. Criar autenticação e sessão.
6. Adaptar endpoints pessoais para `user_id`.
7. Adaptar frontend para login e usuário logado.
8. Proteger Configurações para admin.
9. Reestruturar News como cache global.
10. Implementar Newsletter.
11. Implementar Bubbles versão inicial.

## 22. Critérios Técnicos de Aceite da Migração

- O app inicia usando SQLite.
- Existe admin inicial.
- Existe usuário principal com os dados migrados.
- Login funciona.
- Usuário comum não vê Configurações.
- Catálogo mostra apenas dados do usuário logado.
- Audições mostram apenas dados do usuário logado.
- Diário e estatísticas continuam funcionando.
- News é global.
- Importar da News cria item no catálogo do usuário logado.
- Nenhum dado histórico é perdido.

