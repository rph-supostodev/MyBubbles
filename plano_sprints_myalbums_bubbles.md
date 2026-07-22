# Plano de Sprints — MyAlbums Bubbles

Este documento organiza a evolução do MyAlbums em etapas práticas de implementação.

A ideia é usar este arquivo como controle de andamento: cada Sprint deve ser feita, validada e marcada antes de avançarmos para a próxima.

Base de trabalho:

```text
C:\Users\raphe\OneDrive\Documentos\MyAlbuns - Bubbles
```

## Status

Use esta legenda:

```text
[ ] Pendente
[~] Em andamento
[x] Concluído
```

## Nota de reconciliação (22/07/2026)

Este plano foi conferido diretamente contra o código em produção (`server.js`, `src/database.js`, schema do `data/myalbums.sqlite`) e o histórico do Git. Os status abaixo foram atualizados para refletir o que já está implementado, não apenas o planejado.

Resumo do que mudou nesta revisão:

- Sprint 6 (News global) e Sprint 7 (Newsletter/Artigos) estavam marcadas como pendentes, mas já estão implementadas no código e foram marcadas como concluídas.
- Sprint 10 teve o item de modo dark/light marcado como em andamento, já que há trabalho recente e ainda não commitado em `public/styles.css`.
- Foi criada a Sprint 13 para documentar módulos que já existem no sistema mas nunca entraram neste plano: Podcasts, Comunidade (feed unificado), Reviews/comentários, Meus Queridos Amigos e cadastro público com aprovação do administrador.
- Há alterações locais ainda não commitadas em `public/app.js` e `public/styles.css` (ver `git status`). Antes de considerar qualquer sprint abaixo "fechada" em produção, confirme se essas mudanças precisam ser commitadas primeiro.

---

# Sprint 0 — Preparação da Nova Base

## Objetivo

Garantir que a nova pasta de trabalho esteja isolada da versão pessoal antiga e pronta para receber a nova arquitetura.

## Tarefas

- [x] Copiar projeto atual para `MyAlbuns - Bubbles`.
- [x] Confirmar que a pasta antiga permanece como backup.
- [x] Confirmar que os arquivos de regras e planejamento estão na nova pasta.
- [x] Criar Modelo Técnico de Dados.
- [x] Revisar o documento de modelo técnico antes da implementação.
- [x] Definir credenciais iniciais dos usuários seed.

## Credenciais iniciais definidas

As credenciais abaixo serão usadas apenas para criação inicial dos seeds. Na implementação, as senhas deverão ser gravadas somente como hash.

| Perfil | E-mail | Senha inicial |
|---|---|---|
| Admin | `admin@myalbuns.com` | Definida localmente via seed/env |
| Usuário padrão de teste | `usuario@myalbuns.com` | Definida localmente via seed/env |

## Critérios de aceite

- Projeto antigo permanece intacto.
- Nova pasta contém cópia completa do sistema.
- Todos os novos documentos estão na nova pasta.
- A equipe passa a trabalhar apenas na nova pasta.

---

# Sprint 1 — Banco SQLite e Camada de Dados

## Objetivo

Substituir a dependência principal do `data/db.json` por um banco SQLite estruturado, sem ainda alterar a experiência visual do usuário.

## Tarefas

- [x] Adicionar dependência SQLite ao projeto.
- [x] Criar arquivo de banco em `data/myalbums.sqlite`.
- [x] Criar script ou módulo de inicialização do banco.
- [x] Criar schema inicial com tabelas:
  - [x] `users`
  - [x] `sessions`
  - [x] `catalog_albums`
  - [x] `listening_logs`
  - [x] `news_releases`
  - [x] `articles`
  - [x] `bubbles`
  - [x] `bubble_members`
  - [x] `bubble_posts`
  - [x] `bubble_comments`
  - [x] `app_settings`
- [x] Criar helpers de banco:
  - [x] conexão
  - [x] execução de queries
  - [x] transações
  - [x] geração de IDs
  - [x] timestamps
- [x] Criar índice e constraints principais.
- [x] Garantir `PRAGMA foreign_keys = ON`.

## Nota técnica

O projeto está usando o SQLite nativo do Node.js 24 (`node:sqlite`), sem baixar pacote externo. Por isso o `package.json` declara `node >= 24.0.0`.

## Critérios de aceite

- O app consegue iniciar o SQLite automaticamente.
- O banco é criado se não existir.
- As tabelas principais existem.
- Chaves estrangeiras estão ativas.
- Nenhuma tela precisa estar migrada ainda.

---

# Sprint 2 — Seeds e Migração dos Dados Atuais

## Objetivo

Criar usuários iniciais e migrar os dados pessoais atuais para o novo banco, vinculados ao usuário principal.

## Tarefas

- [x] Criar seed do administrador.
- [x] Criar seed do usuário principal Raphael.
- [x] Definir senha inicial segura para cada seed.
- [x] Implementar hash de senha.
- [x] Migrar `data/db.json > catalog` para `catalog_albums`.
- [x] Migrar `data/db.json > listeningLog` para `listening_logs`.
- [x] Converter campos:
  - [x] `favorite: "Sim" / "Não"` para booleano.
  - [x] `listenAgain: "Sim" / "Não"` para booleano.
  - [x] nota antiga acima de 5 para escala 0 a 5.
  - [x] datas para padrão SQLite em texto ISO.
- [x] Vincular todos os registros migrados ao usuário principal.
- [x] Preservar `db.json` como backup.
- [x] Criar verificação de integridade pós-migração.

## Critérios de aceite

- Admin existe.
- Usuário principal existe.
- Catálogo atual foi migrado.
- Audições atuais foram migradas.
- Nenhum registro pessoal ficou sem `user_id`.
- Nenhum histórico foi perdido.
- Notas estão em escala 0 a 5.

## Nota técnica

A seed e a migração foram implementadas no script `npm run db:seed`. O script é idempotente: pode ser executado novamente sem duplicar usuários, álbuns ou audições já migrados. As senhas iniciais são gravadas apenas como hash `pbkdf2` no SQLite.

---

# Sprint 3 — Autenticação e Sessão

## Objetivo

Criar login local com sessão por cookie, permitindo identificar o usuário logado em todas as requisições.

## Tarefas

- [x] Criar rota `POST /api/auth/login`.
- [x] Criar rota `POST /api/auth/logout`.
- [x] Criar rota `GET /api/auth/me`.
- [x] Validar email e senha.
- [x] Bloquear login de usuário inativo.
- [x] Criar sessão no banco.
- [x] Guardar token com hash no banco.
- [x] Enviar cookie HTTP-only.
- [x] Criar middleware `requireAuth`.
- [x] Criar middleware `requireAdmin`.
- [x] Atualizar `last_login_at`.
- [x] Criar tela de login.
- [x] Criar estado de usuário logado no frontend.
- [x] Redirecionar usuário não autenticado para login.

## Critérios de aceite

- Admin consegue fazer login.
- Usuário principal consegue fazer login.
- Usuário inativo não consegue fazer login.
- Sessão persiste ao atualizar a página.
- Logout encerra sessão.
- Rotas protegidas rejeitam usuário não autenticado.

## Nota técnica

A autenticação local usa as senhas seed já gravadas como hash `pbkdf2`. A sessão é salva na tabela `sessions` com hash SHA-256 do token e enviada ao navegador por cookie HTTP-only `myalbuns_session`.

---

# Sprint 4 — Isolamento dos Dados Pessoais

## Objetivo

Adaptar catálogo, audições, diário e estatísticas para funcionarem por usuário logado.

## Tarefas

- [x] Migrar endpoints de catálogo para SQLite.
- [x] Filtrar catálogo por `user_id`.
- [x] Migrar endpoints de audição para SQLite.
- [x] Filtrar audições por `user_id`.
- [x] Validar que `album_id` pertence ao usuário logado ao salvar audição.
- [x] Adaptar Diário para dados do usuário logado.
- [x] Adaptar Minhas Estatísticas para dados do usuário logado.
- [x] Implementar exclusão lógica de álbum.
- [x] Ajustar importação do Spotify para criar álbum no catálogo do usuário logado.
- [x] Evitar duplicidade de álbum por usuário.
- [x] Manter layout atual funcionando.

## Critérios de aceite

- Usuário A não vê catálogo do Usuário B.
- Usuário A não vê audições do Usuário B.
- Diário mostra apenas audições do usuário logado.
- Estatísticas mostram apenas dados do usuário logado.
- Excluir álbum não apaga histórico.
- Importar álbum cria registro apenas para o usuário logado.

## Nota técnica

A rota `GET /api/db` agora monta `catalog`, `listeningLog` e `lists` a partir do SQLite. O formato de resposta foi mantido compatível com o frontend atual, então Diário e Minhas Estatísticas passaram a respeitar o usuário logado sem mudança visual relevante.

---

# Sprint 5 — Área Administrativa e Usuários

## Objetivo

Criar ferramentas administrativas para gestão de usuários e restringir Configurações ao perfil admin.

## Tarefas

- [x] Ocultar Configurações para usuário comum.
- [x] Proteger rota de configurações no backend.
- [x] Criar aba/tela de Usuários para admin.
- [x] Listar usuários.
- [x] Criar usuário.
- [x] Editar usuário.
- [x] Alterar perfil.
- [x] Ativar/inativar usuário.
- [x] Impedir email duplicado.
- [x] Impedir usuário comum de acessar endpoints administrativos.
- [x] Registrar data de cadastro e último login.

## Critérios de aceite

- Admin visualiza Configurações.
- Usuário comum não visualiza Configurações.
- Usuário comum não acessa endpoints administrativos.
- Admin cadastra usuário.
- Admin edita usuário.
- Admin ativa/inativa usuário.
- Email duplicado é bloqueado.

## Nota técnica

A gestão de usuários está protegida por `requireAdmin`. Usuários comuns não visualizam as abas administrativas no frontend e também recebem `403` ao tentar acessar os endpoints. Emails duplicados são bloqueados com resposta `409`.

---

# Sprint 6 — News Global com Cache SQLite

## Objetivo

Transformar a News em uma área global com cache persistido no SQLite, evitando sobrecarga na API do Spotify.

## Tarefas

- [x] Migrar cache de News para tabela `news_releases`.
- [x] Criar rota `GET /api/news/releases`.
- [x] Criar rota `POST /api/news/releases/refresh`.
- [x] Definir lista oficial de artistas monitorados.
- [x] Sortear poucos artistas por atualização.
- [x] Consultar Spotify de forma controlada.
- [x] Salvar resultados novos em `news_releases`.
- [x] Retornar cache imediatamente.
- [x] Implementar cooldown quando Spotify retornar rate limit.
- [x] Exibir mensagem discreta quando News estiver usando cache.
- [x] Criar importação da News para catálogo pessoal.
- [x] Evitar duplicidade no catálogo do usuário.
- [x] Botão de Atualizar News vai ficar disponível apenas para usuários do nível de Administrador 

## Critérios de aceite

- News retorna conteúdo mesmo se Spotify falhar.
- News é igual para todos os usuários.
- Atualização da News não depende do catálogo pessoal.
- Importar da News salva no catálogo do usuário logado.
- Sistema não sobrecarrega a API.

## Nota técnica

Confirmado em `server.js`: `NEWS_ARTISTS` (lista oficial), `NEWS_REFRESH_COOLDOWN_MS`, `spotifyRateLimitedUntil`, `readCommunityNews` / `refreshCommunityNews` e cache em `news_releases` / `community_news_cache`. A rota `POST /api/news/releases/refresh` exige `requireAdmin`.

---

# Sprint 7 — Newsletter Editorial

## Objetivo

Adicionar área editorial dentro da experiência de comunidade, com artigos gerenciados pelo admin.

## Tarefas

- [x] Criar endpoints de artigos.
- [x] Criar listagem pública de artigos publicados.
- [x] Criar modal/página de leitura de artigo.
- [x] Criar editor de artigo para admin.
- [x] Permitir status:
  - [x] rascunho
  - [x] publicado
  - [x] arquivado
- [x] Gerar slug único.
- [x] Permitir capa, resumo e conteúdo.
- [x] Proteger criação, edição e exclusão para admin.
- [x] Ocultar rascunhos de usuários comuns.
- [x] Criar tela Artigos apenas para usuário do tipo Administrador
- [x] Os artigos são publicados na aba comunidade
- [x] Layout dos artigos segue o layout da aba comunidade

## Critérios de aceite

- Admin cria artigo.
- Admin salva rascunho.
- Admin publica artigo.
- Admin arquiva artigo.
- Usuário comum vê apenas artigos publicados na área Comunidade.
- Usuário comum não acessa editor.

## Nota técnica

Confirmado em `server.js` (`handleArticlesApi`, tabela `articles`): rotas `GET/POST/PUT/DELETE /api/articles`, criação/edição/exclusão exigem `requireAdmin`, listagem usa `listArticlesForUser` (filtra por status conforme perfil) e há comentários de comunidade vinculados ao artigo (`community_comments`) com moderação por autor/admin.

---

# Sprint 8 — Bubbles Versão Inicial

## Objetivo

Criar a primeira versão funcional da área de comunidades musicais.

## Tarefas

- [x] Criar aba Bubbles no menu.
- [x] Criar endpoints de Bubbles.
- [x] Criar listagem de Bubbles visíveis.
- [x] Criar detalhe da Bubble.
- [x] Criar criação de Bubble para admin.
- [x] Criar tipos de visibilidade:
  - [x] pública
  - [x] privada
  - [x] restrita
- [x] Criar tabela de membros.
- [x] Criar convites simples.
- [x] Criar feed de posts por Bubble.
- [x] Criar formulário de post.
- [x] Bloquear post para não membros.
- [x] Criar comentários em posts.
- [x] Bloquear comentário para não membros.
- [x] Permitir admin visualizar todas as Bubbles.

## Critérios de aceite

- Usuário vê Bubbles públicas e restritas.
- Usuário não vê Bubble privada sem participação.
- Membro ativo posta.
- Membro ativo comenta.
- Não membro não posta nem comenta.
- Cada Bubble possui feed independente.

---

# Sprint 9 — Moderação de Bubbles

## Objetivo

Adicionar controles iniciais de moderação para admin, owner e moderador.

## Tarefas

- [x] Definir permissões de owner, moderator e member.
- [x] Permitir ocultar post.
- [x] Permitir remover post.
- [x] Permitir ocultar comentário.
- [x] Permitir remover comentário.
- [x] Permitir remover participante.
- [x] Permitir bloquear participante.
- [x] Permitir arquivar Bubble.
- [x] Exibir status de conteúdo removido/oculto.

## Critérios de aceite

- Admin modera qualquer Bubble.
- Owner modera sua Bubble.
- Moderador modera se tiver permissão.
- Membro comum não modera.
- Conteúdo oculto não aparece para usuário comum.

---

# Sprint 10 — Refinamento de UI/UX e Fluxos

## Objetivo

Refinar a experiência visual e os fluxos após a base funcional estar pronta.

## Tarefas

- [ ] Revisar navegação entre área pessoal e comunidade.
- [ ] Ajustar menu lateral por perfil.
- [ ] Criar estados vazios para Bubbles e Newsletter.
- [ ] Criar feedbacks claros para ações bloqueadas.
- [ ] Revisar responsividade.
- [~] Revisar modo dark/light. (há alterações em `public/styles.css` ainda não commitadas)
- [ ] Revisar modais.
- [ ] Revisar textos e acentos.
- [ ] Padronizar botões e ícones.

## Critérios de aceite

- Usuário entende onde está: área pessoal, News, Newsletter ou Bubbles.
- Admin identifica claramente funções administrativas.
- Usuário comum não vê ações que não pode executar.
- UI mantém o padrão visual já aprovado.

---

# Sprint 11 — Segurança, Integridade e Testes

## Objetivo

Revisar riscos de permissão, vazamento de dados e quebra de histórico.

## Tarefas

- [ ] Testar login/logout.
- [ ] Testar sessão expirada.
- [ ] Testar usuário inativo.
- [ ] Testar acesso admin.
- [ ] Testar acesso usuário comum.
- [ ] Testar isolamento de catálogo.
- [ ] Testar isolamento de audições.
- [ ] Testar importação da News por usuário.
- [ ] Testar duplicidade no catálogo.
- [ ] Testar Bubbles públicas, privadas e restritas.
- [ ] Testar tentativa de post por não membro.
- [ ] Testar tentativa de comentário por não membro.
- [ ] Testar moderação.
- [ ] Revisar logs de erro.

## Critérios de aceite

- Não há vazamento de dados pessoais entre usuários.
- Rotas administrativas são protegidas.
- Histórico antigo permanece intacto.
- Permissões de Bubble funcionam.
- News não quebra se Spotify falhar.

---

# Sprint 12 — Preparação para Evolução Futura

## Objetivo

Organizar a base para recursos futuros sem travar a entrega inicial.

## Tarefas Futuras

- [ ] Perfil público de usuário.
- [ ] Seguidores.
- [ ] Curtidas em posts.
- [ ] Reações em comentários.
- [ ] Ranking de álbuns por Bubble.
- [ ] Clubes de escuta coletiva.
- [ ] Notificações internas.
- [ ] Denúncia/moderação avançada.
- [ ] Salvar artigos para ler depois.
- [ ] Recomendações automáticas.
- [ ] Migração futura para PostgreSQL.

## Critérios de aceite

- A arquitetura atual não impede essas evoluções.
- O modelo de dados permanece coerente.
- A implementação inicial continua simples.

---

# Sprint 13 — Recursos Adicionais Implementados (fora do plano original)

## Objetivo

Registrar módulos que já foram construídos e estão em produção, mas nunca haviam sido descritos neste plano de sprints. Servem apenas como registro retroativo, não como pendência.

## Módulos identificados no código

- [x] **Podcasts** — rota `/api/podcasts`, tabela `podcast_episodes`, listagem pública e gestão de episódios.
- [x] **Comunidade (feed unificado)** — rota `/api/community-content`, agregando News, Artigos e Podcasts em uma única aba.
- [x] **Reviews / comentários em avaliações** — rota `/api/reviews/`, tabela `review_comments`, permite comentar audições/avaliações registradas.
- [x] **Meus Queridos Amigos** — rota `/api/mydearfriends`, tabela `friend_favorites`, perfis públicos de usuário (`/api/profiles/:id`) e favoritar outros usuários.
- [x] **Cadastro público com aprovação do administrador** — rota `POST /api/auth/register`, campo `approval_status` (`pending`, `approved`, `rejected`) na tabela `users`; login é bloqueado até aprovação do admin.
- [x] **Máscara de telefone/WhatsApp brasileira** — campos `phone`/`whatsapp` no cadastro, com máscara aplicada no frontend.

## Observação

Como esses módulos não têm regras de negócio formalizadas em `regras_negocio_myalbums_comunidade.md` nem tabelas descritas em `modelo_tecnico_dados_myalbums_bubbles.md`, recomenda-se atualizar esses dois documentos para incluir Podcasts, Reviews, Meus Queridos Amigos e o fluxo de aprovação de cadastro — hoje eles existem apenas no código.
