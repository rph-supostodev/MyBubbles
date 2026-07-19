# Plano Técnico de Migração — MyAlbums Comunidade

## 1. Visão Geral Técnica

A evolução do **MyAlbums** não deve ser tratada apenas como inclusão de novas telas. O sistema passará de um controle pessoal local para uma aplicação com:

- múltiplos usuários;
- autenticação;
- permissões;
- isolamento de dados;
- área administrativa;
- conteúdo global;
- conteúdo editorial;
- comunidades com membros e fóruns.

A fundação técnica precisa ser refeita com foco em **multiusuário**, porque todos os módulos dependem disso.

---

# 2. Ordem Técnica Recomendada

A implementação deve seguir esta ordem:

1. Base multiusuário;
2. Isolamento dos dados atuais;
3. Área administrativa;
4. News global;
5. Newsletter editorial;
6. Bubbles;
7. Ajustes finais de permissões, auditoria e segurança.

---

# 3. Fase 1 — Base Multiusuário

## Objetivo

Criar a estrutura principal de usuários, autenticação, sessão e controle de perfil.

Essa fase é obrigatória antes de qualquer módulo comunitário.

---

## Funcionalidades técnicas

O sistema deverá permitir:

- cadastrar usuários;
- realizar login;
- manter sessão do usuário autenticado;
- identificar o usuário logado em todas as ações;
- diferenciar usuário comum e administrador;
- controlar status ativo/inativo;
- bloquear acesso de usuários inativos;
- proteger rotas e telas conforme perfil.

---

## Perfis iniciais

O sistema terá dois perfis básicos:

| Perfil | Descrição |
|---|---|
| Admin | Usuário com acesso administrativo |
| User | Usuário comum da plataforma |

---

## Regras técnicas

- Todo usuário deve ter um identificador único.
- O e-mail deve ser único.
- A senha deve ser armazenada com hash, nunca em texto puro.
- Toda requisição autenticada deve carregar o `userId`.
- O sistema deve validar se o usuário está ativo antes de permitir acesso.
- O primeiro administrador poderá ser criado manualmente no banco ou via seed inicial.

---

## Tabela sugerida: `users`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador do usuário |
| name | text | Nome do usuário |
| email | text | E-mail único |
| password_hash | text | Senha criptografada |
| role | text | `admin` ou `user` |
| status | text | `active` ou `inactive` |
| avatar_url | text | Foto/avatar do usuário |
| bio | text | Bio musical |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |
| last_login_at | datetime | Último acesso |

---

## Rotas sugeridas

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Dados do usuário logado |
| POST | `/users` | Criar usuário |
| GET | `/users` | Listar usuários |
| GET | `/users/:id` | Detalhar usuário |
| PUT | `/users/:id` | Editar usuário |
| PATCH | `/users/:id/status` | Ativar/inativar usuário |

---

## Critérios de aceite

- Usuário consegue fazer login.
- Sistema identifica corretamente o usuário logado.
- Admin acessa área administrativa.
- Usuário comum não acessa configurações.
- Usuário inativo não consegue entrar.
- E-mail duplicado não pode ser cadastrado.

---

# 4. Fase 2 — Isolamento dos Dados Atuais

## Objetivo

Adaptar as telas já existentes para funcionarem por usuário.

Essa fase transforma o sistema atual em uma aplicação multiusuário de fato.

---

## Módulos afetados

- Cadastro Catálogo;
- Registrar Audição;
- Diário;
- Minhas Estatísticas.

---

## Regra central

Todos os dados pessoais devem estar vinculados ao `userId`.

Cada registro de catálogo, audição e estatística calculada deve considerar sempre o usuário logado.

---

## Ajustes no catálogo

A tabela de álbuns deve receber o campo `user_id`.

### Tabela sugerida: `catalog_albums`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador do álbum no catálogo |
| user_id | integer / uuid | Dono do álbum |
| spotify_id | text | ID externo do Spotify, se houver |
| title | text | Nome do álbum |
| artist | text | Artista |
| release_year | integer | Ano de lançamento |
| genre | text | Gênero principal |
| cover_url | text | Capa |
| total_tracks | integer | Total de faixas |
| is_active | boolean | Indica se está ativo no catálogo |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Ajustes em audições

A tabela de audições também deve receber `user_id`.

### Tabela sugerida: `listening_logs`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador da audição |
| user_id | integer / uuid | Dono da audição |
| album_id | integer / uuid | Álbum ouvido |
| listened_at | date | Data da audição |
| format | text | Vinil, digital, CD etc. |
| platform | text | Spotify, YouTube, físico etc. |
| listening_type | text | Completa, parcial, descoberta etc. |
| genre | text | Gênero |
| tracks_listened | integer | Faixas ouvidas |
| duration_minutes | integer | Duração |
| rating | decimal | Nota |
| mood | text | Humor |
| location | text | Local |
| company | text | Companhia |
| is_favorite | boolean | Favorito |
| listen_again | boolean | Reouvir |
| notes | text | Observações |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Regra de nota

A escala de nota deve ser fechada como:

> **0 a 5 estrelas, permitindo meia estrela.**

Valores permitidos:

- 0;
- 0.5;
- 1;
- 1.5;
- 2;
- 2.5;
- 3;
- 3.5;
- 4;
- 4.5;
- 5.

---

## Regra de exclusão de álbum

A exclusão de álbum deve ser lógica.

Ou seja:

- o álbum deixa de aparecer no catálogo ativo do usuário;
- o histórico de audições permanece intacto;
- as estatísticas antigas continuam funcionando;
- o álbum pode continuar aparecendo em detalhes de audições antigas.

Campo recomendado:

```text
is_active = false
```

Não excluir fisicamente do banco quando houver audições vinculadas.

---

## Ajustes no Diário

O diário deverá buscar apenas registros onde:

```sql
listening_logs.user_id = usuário logado
```

---

## Ajustes nas Estatísticas

Todos os cálculos deverão considerar:

```sql
WHERE user_id = usuário logado
```

Exemplos:

- total de audições;
- discos únicos;
- artistas únicos;
- horas ouvidas;
- nota média;
- favoritos;
- audições por gênero;
- horas por década;
- resumo mensal.

---

## Critérios de aceite

- Usuário A não vê catálogo do Usuário B.
- Usuário A não vê audições do Usuário B.
- Diário mostra apenas dados do usuário logado.
- Estatísticas são individuais.
- Ao excluir um álbum usado em audição, o histórico permanece.
- Nota aceita apenas valores entre 0 e 5, com intervalo de 0.5.

---

# 5. Fase 3 — Área Administrativa

## Objetivo

Criar a estrutura administrativa para gestão do sistema.

---

## Funcionalidades do Admin

O administrador poderá:

- visualizar usuários cadastrados;
- criar novos usuários;
- editar dados de usuários;
- ativar/inativar usuários;
- definir perfil do usuário;
- acessar configurações gerais;
- futuramente gerenciar artigos, Bubbles e moderação.

---

## Controle de visibilidade

No menu lateral:

- Admin visualiza **Configurações**;
- Usuário comum não visualiza **Configurações**.

Além da ocultação visual, a rota também deve ser protegida.

---

## Telas administrativas iniciais

### Configurações

Tela principal restrita ao admin.

### Usuários

Listagem de usuários com:

- nome;
- e-mail;
- perfil;
- status;
- data de cadastro;
- último acesso;
- ações.

### Cadastro/Edição de Usuário

Campos:

- nome;
- e-mail;
- senha;
- perfil;
- status.

---

## Regras técnicas

- Apenas admin pode cadastrar usuário.
- Apenas admin pode alterar perfil.
- Apenas admin pode inativar usuário.
- Usuário comum não pode acessar endpoints administrativos.
- Usuário comum não pode alterar seu próprio perfil.

---

## Critérios de aceite

- Admin acessa Configurações.
- Usuário comum não vê Configurações.
- Usuário comum não acessa rota administrativa diretamente.
- Admin consegue criar, editar e inativar usuários.

---

# 6. Fase 4 — News Global

## Objetivo

Reestruturar a tela News como uma área global compartilhada por todos os usuários.

A News não pertence a um usuário específico.

---

## Conceito técnico

A News deve funcionar como um **cache global de lançamentos musicais**.

Isso evita que cada usuário faça chamadas repetidas ao Spotify ou outra API externa.

---

## Tabela sugerida: `news_releases`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador interno |
| external_id | text | ID do Spotify/API |
| title | text | Nome do álbum |
| artist | text | Artista |
| release_date | date | Data de lançamento |
| cover_url | text | Capa |
| total_tracks | integer | Número de faixas |
| external_url | text | Link externo |
| source | text | Origem: Spotify/API |
| payload_json | json | Dados brutos da API |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Funcionamento

- O sistema busca lançamentos na API externa.
- Os dados são salvos em cache global.
- Todos os usuários veem a mesma News.
- Quando um usuário importa um lançamento, uma cópia/vínculo é criada no catálogo pessoal dele.

---

## Importação da News para catálogo

Ao clicar em “Importar”:

1. O sistema identifica o usuário logado.
2. Verifica se o álbum já existe no catálogo dele.
3. Se não existir, cria registro em `catalog_albums`.
4. O álbum passa a pertencer ao usuário.

---

## Regra de duplicidade

O mesmo lançamento pode estar no catálogo de vários usuários.

Porém, para o mesmo usuário, o sistema deve evitar duplicidade baseada em:

- `spotify_id`;
- ou combinação de artista + álbum + ano.

---

## Critérios de aceite

- News mostra os mesmos lançamentos para todos.
- Atualização da News não depende do usuário logado.
- Importar lançamento salva no catálogo do usuário logado.
- Usuário A importar álbum não cria álbum no catálogo do Usuário B.
- Sistema evita duplicidade no catálogo pessoal.

---

# 7. Fase 5 — Newsletter Editorial

## Objetivo

Permitir que o administrador publique conteúdos editoriais sobre música.

---

## Tipos de conteúdo

A Newsletter poderá conter:

- artigos;
- matérias;
- resenhas;
- listas;
- curadorias;
- notícias;
- textos opinativos.

---

## Tabela sugerida: `articles`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador do artigo |
| author_id | integer / uuid | Admin autor |
| title | text | Título |
| slug | text | URL amigável |
| summary | text | Resumo |
| content | text / markdown | Conteúdo |
| cover_url | text | Imagem de capa |
| status | text | `draft`, `published`, `archived` |
| published_at | datetime | Data de publicação |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Regras de permissão

Admin pode:

- criar artigo;
- salvar como rascunho;
- publicar;
- editar;
- arquivar;
- excluir.

Usuário comum pode:

- visualizar artigos publicados.

---

## Status do artigo

| Status | Descrição |
|---|---|
| draft | Rascunho, visível apenas para admin |
| published | Publicado, visível para todos |
| archived | Arquivado, não aparece para usuários comuns |

---

## Critérios de aceite

- Admin cria artigo.
- Admin salva rascunho.
- Admin publica artigo.
- Usuário comum vê apenas artigos publicados.
- Usuário comum não acessa rascunhos.
- Usuário comum não cria, edita ou exclui artigos.

---

# 8. Fase 6 — Bubbles

## Objetivo

Criar a camada comunitária do sistema.

As Bubbles serão comunidades musicais com feed próprio, membros, permissões e discussões.

---

## Conceito

Uma Bubble é uma comunidade temática.

Exemplos:

- Jazz;
- MPB;
- Rock Progressivo;
- Discos de Vinil;
- Clube de Escuta;
- Funk, Soul e Black Music;
- Álbuns dos anos 70.

Cada Bubble possui seu próprio feed de posts e comentários.

---

## Tabela sugerida: `bubbles`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador da Bubble |
| name | text | Nome da Bubble |
| description | text | Descrição |
| visibility | text | `public`, `private`, `restricted` |
| created_by | integer / uuid | Criador |
| status | text | `active`, `inactive`, `archived` |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Tabela sugerida: `bubble_members`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador |
| bubble_id | integer / uuid | Bubble |
| user_id | integer / uuid | Usuário |
| role | text | `owner`, `moderator`, `member` |
| status | text | `invited`, `active`, `pending`, `removed`, `blocked` |
| invited_by | integer / uuid | Quem convidou |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Tabela sugerida: `bubble_posts`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador do post |
| bubble_id | integer / uuid | Bubble |
| user_id | integer / uuid | Autor |
| title | text | Título |
| content | text | Conteúdo |
| album_id | integer / uuid | Álbum relacionado, opcional |
| status | text | `active`, `removed`, `hidden` |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Tabela sugerida: `bubble_comments`

| Campo | Tipo | Descrição |
|---|---|---|
| id | integer / uuid | Identificador do comentário |
| post_id | integer / uuid | Post |
| user_id | integer / uuid | Autor |
| parent_comment_id | integer / uuid | Comentário pai, opcional |
| content | text | Conteúdo |
| status | text | `active`, `removed`, `hidden` |
| created_at | datetime | Data de criação |
| updated_at | datetime | Data de atualização |

---

## Tipos de Bubble

### Public

Todos podem visualizar.

A participação ativa depende de ser membro.

### Private

Somente membros podem visualizar e interagir.

### Restricted

Todos podem visualizar, mas apenas membros podem postar e comentar.

Este parece ser o modelo principal desejado para o sistema.

---

## Regras de participação

- Usuário pode participar de várias Bubbles.
- Bubble pode ter vários usuários.
- Usuário só pode postar se for membro ativo.
- Usuário só pode comentar se for membro ativo.
- Usuário não membro pode apenas visualizar Bubbles públicas ou restritas.
- Usuário não membro não visualiza Bubbles privadas.
- Admin pode moderar qualquer Bubble.

---

## Regras de convite

Inicialmente, a regra recomendada é:

- Admin pode convidar qualquer usuário para qualquer Bubble.
- Owner da Bubble pode convidar usuários.
- Moderador pode convidar usuários, se essa permissão for habilitada.

---

## Regras de moderação

Admin, owner ou moderador poderão:

- remover post;
- ocultar comentário;
- remover participante;
- bloquear participante;
- arquivar Bubble.

---

## Rotas sugeridas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/bubbles` | Listar Bubbles visíveis |
| POST | `/bubbles` | Criar Bubble |
| GET | `/bubbles/:id` | Detalhar Bubble |
| PUT | `/bubbles/:id` | Editar Bubble |
| POST | `/bubbles/:id/invite` | Convidar usuário |
| POST | `/bubbles/:id/join` | Solicitar entrada |
| GET | `/bubbles/:id/posts` | Listar posts |
| POST | `/bubbles/:id/posts` | Criar post |
| POST | `/posts/:id/comments` | Criar comentário |
| DELETE | `/posts/:id` | Remover/ocultar post |
| DELETE | `/comments/:id` | Remover/ocultar comentário |

---

## Critérios de aceite

- Usuário visualiza Bubbles públicas.
- Usuário não visualiza Bubble privada sem convite.
- Usuário não membro não consegue postar.
- Usuário não membro não consegue comentar.
- Membro ativo consegue postar.
- Membro ativo consegue comentar.
- Admin consegue moderar qualquer Bubble.
- Uma Bubble possui feed independente.

---

# 9. Modelo de Dados Geral Recomendado

## Tabelas principais

```text
users
catalog_albums
listening_logs
news_releases
articles
bubbles
bubble_members
bubble_posts
bubble_comments
```

---

## Relacionamentos principais

```text
users 1:N catalog_albums
users 1:N listening_logs
catalog_albums 1:N listening_logs

users 1:N articles

users N:N bubbles
bubbles 1:N bubble_posts
bubble_posts 1:N bubble_comments
users 1:N bubble_posts
users 1:N bubble_comments

news_releases N:N users através da importação para catalog_albums
```

---

# 10. Banco de Dados Recomendado

## Situação atual

O sistema usa uma estrutura local simples.

Para a nova versão, é necessário ter relações claras entre entidades.

---

## Recomendação inicial

Utilizar **SQLite** como banco estruturado inicial, caso o objetivo ainda seja manter simplicidade local.

Vantagens:

- simples de configurar;
- não exige servidor externo;
- permite tabelas relacionais;
- suporta chaves estrangeiras;
- permite evolução gradual;
- facilita migração futura para PostgreSQL.

---

## Recomendação futura

Caso o sistema evolua para uso real por múltiplos usuários simultâneos, o ideal será migrar para:

```text
PostgreSQL
```

Principalmente por causa de:

- concorrência;
- volume de dados;
- integridade relacional;
- permissões;
- escalabilidade;
- deploy em nuvem;
- backups;
- performance em consultas comunitárias.

---

# 11. Estratégia de Migração dos Dados Atuais

## Etapa 1 — Criar usuário administrador inicial

Criar um usuário admin padrão.

Exemplo:

```text
id: 1
name: Administrador
email: admin@myalbums.com
role: admin
status: active
```

---

## Etapa 2 — Criar usuário dono dos dados atuais

Como os dados atuais pertencem a uma única pessoa, criar um usuário principal para receber os registros existentes.

Exemplo:

```text
id: 2
name: Raphael
role: user
status: active
```

---

## Etapa 3 — Vincular dados existentes

Todos os álbuns e audições existentes deverão receber o `user_id` do usuário dono dos dados atuais.

Exemplo:

```sql
UPDATE catalog_albums
SET user_id = 2
WHERE user_id IS NULL;
```

```sql
UPDATE listening_logs
SET user_id = 2
WHERE user_id IS NULL;
```

---

## Etapa 4 — Validar integridade

Verificar:

- álbuns sem usuário;
- audições sem usuário;
- audições sem álbum;
- usuários duplicados;
- e-mails duplicados;
- registros órfãos.

---

# 12. Controle de Permissões

## Estratégia

O sistema deve possuir validação em duas camadas:

1. **Frontend**
   - ocultar menus;
   - bloquear ações;
   - ajustar botões disponíveis.

2. **Backend**
   - validar todas as permissões antes de executar ações.

A validação no backend é obrigatória.

---

## Exemplos de validação

### Usuário comum tentando acessar configurações

Resultado esperado:

```text
Acesso negado
```

---

### Usuário tentando editar álbum de outro usuário

Resultado esperado:

```text
Ação não permitida
```

---

### Usuário tentando postar em Bubble sem ser membro

Resultado esperado:

```text
Você precisa participar desta Bubble para publicar
```

---

# 13. Fases de Implementação

## Sprint 1 — Multiusuário e autenticação

Entregas:

- tabela de usuários;
- login;
- sessão;
- perfil admin/user;
- status ativo/inativo;
- proteção inicial de rotas.

---

## Sprint 2 — Isolamento dos dados pessoais

Entregas:

- `user_id` em catálogo;
- `user_id` em audições;
- filtros por usuário logado;
- diário individual;
- estatísticas individuais;
- exclusão lógica de álbum;
- nota 0 a 5 com meia estrela.

---

## Sprint 3 — Área administrativa

Entregas:

- tela de configurações apenas para admin;
- CRUD de usuários;
- ativar/inativar usuário;
- alteração de perfil.

---

## Sprint 4 — News global

Entregas:

- cache global de lançamentos;
- atualização de lançamentos via API;
- listagem comum para todos;
- importação para catálogo pessoal;
- prevenção de duplicidade por usuário.

---

## Sprint 5 — Newsletter

Entregas:

- CRUD de artigos;
- status rascunho/publicado/arquivado;
- tela pública de leitura;
- permissões admin/user.

---

## Sprint 6 — Bubbles versão inicial

Entregas:

- cadastro de Bubbles;
- tipos de visibilidade;
- membros;
- convites;
- feed;
- posts;
- comentários;
- bloqueio de interação para não membros.

---

## Sprint 7 — Moderação e refinamentos

Entregas:

- remover/ocultar posts;
- remover/ocultar comentários;
- bloquear membros;
- arquivar Bubble;
- ajustes de performance;
- revisão de permissões.

---

# 14. Riscos Técnicos

## Risco 1 — Implementar comunidade sem multiusuário sólido

Se Bubbles e Newsletter forem criadas antes da autenticação e permissões, o sistema ficará frágil.

Mitigação:

> Começar pela base multiusuário.

---

## Risco 2 — Dados pessoais vazando entre usuários

Se os filtros por `userId` não forem aplicados corretamente, um usuário poderá ver dados de outro.

Mitigação:

> Criar camada padrão de consulta sempre filtrando pelo usuário logado.

---

## Risco 3 — Exclusão física de dados históricos

Excluir álbuns usados em audições pode quebrar histórico, diário e estatísticas.

Mitigação:

> Usar exclusão lógica.

---

## Risco 4 — Sobrecarga na API do Spotify

Se cada usuário atualizar News individualmente, haverá chamadas desnecessárias.

Mitigação:

> Usar cache global de News.

---

## Risco 5 — Bubbles ficarem complexas demais no início

Bubbles envolvem membros, convites, posts, comentários, visibilidade e moderação.

Mitigação:

> Implementar versão inicial simples e evoluir depois.

---

# 15. Decisões Técnicas Já Fechadas

| Tema | Decisão |
|---|---|
| Sistema será multiusuário | Sim |
| Catálogo será individual | Sim |
| Audições serão individuais | Sim |
| Diário será individual | Sim |
| Estatísticas serão individuais | Sim |
| Configurações apenas para admin | Sim |
| News será global | Sim |
| News usará cache global | Sim |
| Importação da News salva no catálogo do usuário logado | Sim |
| Newsletter será gerenciada pelo admin | Sim |
| Usuário comum só lê artigos publicados | Sim |
| Bubbles terão feed próprio | Sim |
| Usuário só interage em Bubble se for membro | Sim |
| Não membro pode visualizar Bubble pública/restrita | Sim |
| Álbum usado em audição terá exclusão lógica | Sim |
| Nota será de 0 a 5 estrelas com meia estrela | Sim |
| Banco recomendado inicial | SQLite |
| Banco recomendado futuro | PostgreSQL |

---

# 16. Próximo Passo Recomendado

Antes de partir para desenvolvimento, o próximo documento deveria ser o **Modelo Técnico de Dados**, contendo:

- DER simplificado;
- tabelas;
- campos;
- tipos;
- chaves primárias;
- chaves estrangeiras;
- regras de relacionamento;
- exemplos de consultas;
- regras de migração dos dados atuais.

Esse modelo será a base para o programador alterar o sistema sem quebrar as telas já existentes.
