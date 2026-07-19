# Regras de Negócio — MyAlbums Comunidade

## 1. Visão Geral

O **MyAlbums** será evoluído de um sistema individual de controle de catálogo e audições musicais para uma plataforma multiusuário com recursos de comunidade.

O sistema será dividido em três grandes áreas:

1. **Área Pessoal do Usuário**
2. **Área de Comunidade**
3. **Área Administrativa**

As regras abaixo definem o comportamento esperado do sistema, os limites de acesso, as permissões por perfil e as relações entre usuários, catálogos, audições, notícias, newsletter e Bubbles.

---

# 2. Perfis de Acesso

## RN-001 — Perfis do sistema

O sistema deverá possuir, no mínimo, os seguintes perfis de acesso:

- **Administrador**
- **Usuário comum**

---

## RN-002 — Acesso do administrador

O administrador poderá acessar todas as áreas do sistema, incluindo:

- Cadastro de catálogo;
- Registro de audições;
- Diário;
- Minhas estatísticas;
- News;
- Newsletter;
- Bubbles;
- Configurações;
- Controle de usuários;
- Gestão de conteúdos;
- Gestão de permissões;
- Gestão de comunidades.

---

## RN-003 — Acesso do usuário comum

O usuário comum poderá acessar apenas:

- Seu próprio catálogo;
- Suas próprias audições;
- Seu próprio diário;
- Suas próprias estatísticas;
- Área de News;
- Conteúdos publicados na Newsletter;
- Bubbles disponíveis para visualização;
- Bubbles das quais participa.

---

## RN-004 — Restrição da aba Configurações

A aba **Configurações** deverá ser exibida apenas para usuários com perfil de **Administrador**.

Usuários comuns não deverão visualizar essa aba no menu lateral.

---

# 3. Controle de Usuários

## RN-005 — Cadastro de usuários

Somente o administrador poderá cadastrar novos usuários no sistema.

---

## RN-006 — Dados básicos do usuário

O cadastro de usuário deverá conter, no mínimo:

- Nome;
- E-mail;
- Senha;
- Perfil de acesso;
- Status do usuário;
- Data de cadastro.

Campos adicionais poderão ser incluídos futuramente, como:

- Foto ou avatar;
- Bio musical;
- Gêneros favoritos;
- Artistas favoritos.

---

## RN-007 — Status do usuário

O usuário poderá ter, no mínimo, os seguintes status:

- **Ativo**
- **Inativo**

Usuários inativos não deverão conseguir acessar o sistema.

---

## RN-008 — E-mail único

Não poderá existir mais de um usuário cadastrado com o mesmo e-mail.

---

## RN-009 — Edição de usuários

Somente o administrador poderá editar dados cadastrais e permissões de outros usuários.

---

## RN-010 — Desativação de usuários

Somente o administrador poderá desativar usuários.

Ao ser desativado, o usuário não deverá perder seus dados históricos, mas não poderá acessar o sistema.

---

# 4. Catálogo de Álbuns

## RN-011 — Catálogo individual

Cada usuário deverá possuir seu próprio catálogo de álbuns.

O catálogo de um usuário não deverá ser exibido para outro usuário.

---

## RN-012 — Cadastro manual de álbum

O usuário poderá cadastrar álbuns manualmente em seu catálogo.

---

## RN-013 — Importação de álbum via API

O usuário poderá buscar e importar álbuns através de integração com API externa, como Spotify.

---

## RN-014 — Álbum importado pertence ao usuário

Quando um álbum for importado via API, ele deverá ser vinculado ao catálogo do usuário que realizou a importação.

---

## RN-015 — Exclusão de álbum do catálogo

O usuário poderá excluir álbuns do seu próprio catálogo.

Um usuário não poderá excluir álbuns pertencentes ao catálogo de outro usuário.

---

## RN-016 — Edição de álbum

O usuário poderá editar informações dos álbuns cadastrados em seu próprio catálogo.

---

## RN-017 — Álbum usado em audição

Caso um álbum já tenha sido utilizado em registros de audição, a exclusão deverá ser tratada com regra específica.

Opções possíveis:

- Impedir exclusão;
- Permitir exclusão lógica;
- Manter o histórico da audição preservado.

A regra final deverá ser definida na etapa de detalhamento funcional.

---

# 5. Registro de Audições

## RN-018 — Audição individual

Cada audição deverá pertencer exclusivamente ao usuário que a cadastrou.

---

## RN-019 — Álbum obrigatório

Para registrar uma audição, o usuário deverá selecionar um álbum do seu próprio catálogo.

---

## RN-020 — Dados da audição

O registro de audição poderá conter:

- Álbum;
- Data da audição;
- Formato;
- Plataforma ou mídia;
- Tipo de audição;
- Gênero;
- Faixas ouvidas;
- Duração em minutos;
- Nota;
- Humor;
- Local;
- Companhia;
- Favorito;
- Reouvir;
- Observações.

---

## RN-021 — Data da audição

A data da audição deverá ser obrigatória.

---

## RN-022 — Nota da audição

A nota da audição deverá respeitar a escala definida pelo sistema.

Exemplo:

- 0 a 5;
- 1 a 5;
- Escala com estrelas.

A escala final deverá ser definida no detalhamento da tela.

---

## RN-023 — Histórico de audições

O usuário deverá visualizar apenas o histórico das audições cadastradas por ele.

---

## RN-024 — Edição de audição

O usuário poderá editar apenas suas próprias audições.

---

## RN-025 — Exclusão de audição

O usuário poderá excluir apenas suas próprias audições.

---

# 6. Diário

## RN-026 — Diário individual

O diário deverá exibir apenas as audições do usuário logado.

---

## RN-027 — Organização por data

O diário deverá organizar as audições por data, permitindo visualizar o que foi ouvido em determinado dia, mês ou período.

---

## RN-028 — Informações exibidas no diário

O diário poderá exibir:

- Data;
- Capa do álbum;
- Nome do álbum;
- Artista;
- Ano de lançamento;
- Gênero;
- Formato;
- Nota;
- Favorito;
- Link para detalhes da audição.

---

## RN-029 — Consulta mensal

O usuário deverá conseguir visualizar um resumo das audições realizadas em determinado mês.

---

# 7. Minhas Estatísticas

## RN-030 — Estatísticas individuais

A tela **Minhas Estatísticas** deverá calcular os indicadores apenas com base nas audições do usuário logado.

---

## RN-031 — Indicadores básicos

A tela poderá exibir indicadores como:

- Total de audições;
- Discos únicos;
- Artistas únicos;
- Horas ouvidas;
- Nota média;
- Total de favoritos.

---

## RN-032 — Gráficos e agrupamentos

As estatísticas poderão ser agrupadas por:

- Gênero;
- Década;
- Mês;
- Ano;
- Álbum;
- Artista;
- Formato;
- Plataforma;
- Tipo de audição.

---

## RN-033 — Atualização das estatísticas

As estatísticas deverão ser atualizadas sempre que o usuário cadastrar, editar ou excluir uma audição.

---

# 8. News / Comunidade

## RN-034 — Área comum de News

A tela **News** deverá ser comum para todos os usuários.

---

## RN-035 — Lançamentos via API

A tela News poderá exibir lançamentos de álbuns obtidos por API externa.

---

## RN-036 — Conteúdo global

Os lançamentos exibidos na News serão globais e não dependerão do catálogo individual do usuário.

---

## RN-037 — Importação de lançamento

O usuário poderá importar um álbum exibido na News para seu catálogo pessoal.

---

## RN-038 — Visualização de lançamento

O usuário poderá visualizar detalhes de um lançamento exibido na News.

---

## RN-039 — Abertura em plataforma externa

O sistema poderá permitir que o usuário abra o álbum em plataformas externas, como Spotify.

---

# 9. Newsletter / Conteúdo Editorial

## RN-040 — Newsletter dentro da área de comunidade

A tela News deverá possuir uma área de Newsletter ou conteúdos editoriais.

---

## RN-041 — Publicação de artigos

Somente o administrador poderá publicar artigos, matérias e textos sobre música.

---

## RN-042 — Edição de artigos

Somente o administrador poderá editar artigos publicados.

---

## RN-043 — Exclusão de artigos

Somente o administrador poderá excluir artigos publicados.

---

## RN-044 — Visualização de artigos

Usuários comuns poderão visualizar os artigos publicados pelo administrador.

---

## RN-045 — Tipos de conteúdo editorial

A Newsletter poderá conter:

- Resenhas de álbuns;
- Matérias sobre artistas;
- Textos sobre gêneros musicais;
- Curadorias;
- Listas recomendadas;
- Notícias musicais;
- Artigos opinativos;
- Histórias de discos clássicos.

---

## RN-046 — Status de publicação

Um artigo poderá possuir status como:

- Rascunho;
- Publicado;
- Arquivado.

Somente artigos publicados deverão aparecer para usuários comuns.

---

# 10. Bubbles

## RN-047 — Criação da aba Bubbles

O sistema deverá possuir uma aba chamada **Bubbles**.

---

## RN-048 — Conceito de Bubble

Uma Bubble será uma comunidade musical dentro do sistema.

Cada Bubble terá seu próprio feed de discussão, funcionando como um fórum.

---

## RN-049 — Relação entre usuários e Bubbles

A relação entre usuários e Bubbles será muitos-para-muitos.

Ou seja:

- Um usuário poderá participar de várias Bubbles;
- Uma Bubble poderá possuir vários usuários.

---

## RN-050 — Participação por convite

O usuário só poderá interagir em uma Bubble se tiver sido convidado ou aceito nela.

---

## RN-051 — Visualização sem participação

Usuários que não participam de uma Bubble poderão apenas visualizar o conteúdo, caso a Bubble permita visualização pública.

---

## RN-052 — Restrição de postagem

Usuários não participantes de uma Bubble não poderão criar publicações dentro dela.

---

## RN-053 — Restrição de comentários

Usuários não participantes de uma Bubble não poderão comentar publicações dentro dela.

---

## RN-054 — Feed da Bubble

Cada Bubble deverá possuir um feed próprio.

O feed poderá conter:

- Publicações;
- Comentários;
- Respostas;
- Discussões sobre álbuns;
- Discussões sobre artistas;
- Recomendações;
- Listas;
- Debates;
- Audições compartilhadas.

---

## RN-055 — Publicação em Bubble

Usuários participantes poderão criar publicações dentro da Bubble.

---

## RN-056 — Comentários em Bubble

Usuários participantes poderão comentar publicações dentro da Bubble.

---

## RN-057 — Tipos de Bubble

O sistema poderá possuir diferentes tipos de Bubble:

- Bubble aberta;
- Bubble privada;
- Bubble pública com discussão restrita.

---

## RN-058 — Bubble aberta

Uma Bubble aberta poderá ser visualizada por todos os usuários.

A participação ativa poderá depender de convite ou solicitação de entrada.

---

## RN-059 — Bubble privada

Uma Bubble privada deverá ser visualizada apenas por usuários convidados ou participantes.

---

## RN-060 — Bubble pública com discussão restrita

Uma Bubble pública com discussão restrita poderá ser visualizada por todos os usuários, mas apenas participantes poderão postar e comentar.

---

## RN-061 — Convite para Bubble

Usuários poderão ser convidados para participar de uma Bubble.

A regra de quem poderá convidar deverá ser definida no detalhamento funcional.

Possibilidades:

- Apenas administrador;
- Criador da Bubble;
- Moderadores da Bubble;
- Participantes com permissão.

---

## RN-062 — Status de participação na Bubble

A participação de um usuário em uma Bubble poderá possuir status como:

- Convidado;
- Participante;
- Pendente;
- Removido;
- Bloqueado.

---

## RN-063 — Remoção de participante

Usuários com permissão administrativa ou de moderação poderão remover participantes de uma Bubble.

---

## RN-064 — Moderação de conteúdo

O sistema deverá prever regras de moderação para publicações e comentários em Bubbles.

---

# 11. Permissões de Comunidade

## RN-065 — Usuário participante da Bubble

O usuário participante poderá:

- Visualizar a Bubble;
- Criar publicações;
- Comentar;
- Responder comentários;
- Interagir com conteúdos;
- Participar das discussões.

---

## RN-066 — Usuário não participante da Bubble

O usuário não participante poderá:

- Visualizar a Bubble, caso ela seja pública ou aberta;
- Não poderá criar publicações;
- Não poderá comentar;
- Não poderá responder;
- Não poderá interagir ativamente.

---

## RN-067 — Administrador nas Bubbles

O administrador poderá visualizar, gerenciar e moderar todas as Bubbles.

---

# 12. Segurança e Isolamento de Dados

## RN-068 — Isolamento de dados pessoais

Os dados pessoais de catálogo, audições, diário e estatísticas deverão ser isolados por usuário.

---

## RN-069 — Dados globais

Serão considerados dados globais:

- News;
- Lançamentos via API;
- Artigos publicados;
- Bubbles públicas;
- Conteúdos visíveis de comunidade.

---

## RN-070 — Validação de permissão

Toda ação sensível deverá validar o perfil e a permissão do usuário.

Exemplos:

- Criar usuário;
- Publicar artigo;
- Editar artigo;
- Excluir artigo;
- Criar Bubble;
- Convidar participante;
- Postar em Bubble;
- Comentar em Bubble;
- Excluir conteúdo.

---

# 13. Administração do Sistema

## RN-071 — Área administrativa

O sistema deverá possuir uma área administrativa acessível apenas pelo administrador.

---

## RN-072 — Gestão de usuários

O administrador deverá conseguir gerenciar usuários cadastrados.

---

## RN-073 — Gestão de artigos

O administrador deverá conseguir criar, editar, publicar, arquivar e excluir artigos da Newsletter.

---

## RN-074 — Gestão de Bubbles

O administrador deverá conseguir gerenciar Bubbles.

---

## RN-075 — Gestão de permissões

O administrador deverá conseguir definir permissões e perfis de acesso.

---

# 14. Integrações

## RN-076 — Integração com Spotify

O sistema poderá possuir integração com Spotify para:

- Buscar álbuns;
- Importar álbuns;
- Exibir capas;
- Exibir artistas;
- Exibir faixas;
- Abrir álbum no Spotify;
- Atualizar lançamentos musicais.

---

## RN-077 — Dados importados da API

Dados importados de API externa deverão ser armazenados de forma que possam ser vinculados ao catálogo do usuário.

---

## RN-078 — Falha na API externa

Caso a API externa esteja indisponível, o sistema deverá informar o usuário e não impedir o uso das funcionalidades locais já cadastradas.

---

# 15. Considerações Futuras

As regras abaixo não são obrigatórias para a primeira versão, mas podem ser consideradas em versões futuras:

- Curtidas em publicações;
- Reações em comentários;
- Compartilhamento de audições nas Bubbles;
- Ranking de álbuns por comunidade;
- Seguidores entre usuários;
- Perfil público do usuário;
- Timeline geral da comunidade;
- Recomendações automáticas de álbuns;
- Solicitação de entrada em Bubbles;
- Moderação por denúncia;
- Notificações internas;
- Comentários em artigos da Newsletter;
- Salvar artigos para ler depois;
- Ranking de usuários mais ativos;
- Clubes de escuta coletiva.

---

# 16. Resumo das Regras Principais

- Cada usuário terá seu próprio catálogo.
- Cada usuário terá suas próprias audições.
- Cada usuário terá seu próprio diário.
- Cada usuário terá suas próprias estatísticas.
- A tela News será comum para todos.
- A News exibirá lançamentos via API.
- A Newsletter será gerenciada apenas pelo administrador.
- Apenas o administrador poderá publicar artigos e matérias.
- A aba Configurações será visível apenas para o administrador.
- O administrador poderá cadastrar e gerenciar usuários.
- A aba Bubbles será uma área de comunidades musicais.
- Cada Bubble terá seu próprio feed.
- Um usuário poderá participar de várias Bubbles.
- Uma Bubble poderá possuir vários usuários.
- Usuários só poderão postar e comentar em Bubbles das quais participam.
- Usuários não participantes poderão apenas visualizar Bubbles públicas ou abertas.
- Dados pessoais deverão ser isolados por usuário.
- Dados comunitários poderão ser compartilhados conforme as regras de visibilidade.
