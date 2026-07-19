# MyBubbles

MyBubbles e uma plataforma musical local para catalogar albuns, registrar audicoes, acompanhar estatisticas e criar interacoes de comunidade com artigos, podcasts, Bubbles e perfis.

## Como rodar localmente

1. Instale o Node.js 24 ou superior.
2. Copie `.env.example` para `.env` e preencha as credenciais necessarias.
3. No terminal, execute:

```powershell
npm start
```

4. Acesse:

```text
http://localhost:3000
```

## Banco de dados

O sistema cria automaticamente o SQLite local em `data/myalbums.sqlite`.

Arquivos locais de ambiente, banco, cache e logs nao devem ser versionados.
