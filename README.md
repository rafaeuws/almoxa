# Almoxarifado Cloud

Sistema de controle de estoque **multi-hotel** com backend próprio, banco PostgreSQL e três perfis de usuário (Administrador, Almoxarifado e Atendente) com fluxo de aprovação de requisições. Versão em nuvem, multiusuário, pronta para **Render + Neon.tech**.

Desenvolvido por **Rafael Almeida** · rafael.almeida@accor.com

---

## Arquitetura

```
Navegador (public/)  ──HTTPS──►  API REST (Express, src/server.js)  ──SSL──►  PostgreSQL (Neon.tech)
   SPA em JS puro                 Auth JWT + bcrypt, helmet, gzip,            (banco relacional)
   (login, telas, fetch)          regras de estoque em transações
```

- **Backend:** Node.js + Express (`src/server.js`); acesso ao banco em `src/db.js`; esquema em `src/schema.sql`.
- **Banco:** PostgreSQL relacional (hotéis, usuários, vínculos usuário↔hotel, itens, movimentações, entradas, requisições + itens, contagens, contadores de documento por hotel) — hospedado no **Neon.tech**.
- **Segurança:** senha com **hash bcrypt**, sessão por **token JWT**, **helmet** (cabeçalhos de segurança), validação de perfil e de acesso por hotel no servidor, e proteção contra ids malformados.
- **Performance:** **gzip** (compression), pool de conexões enxuto para o Neon serverless, cache de arquivos estáticos e índices no banco.
- **Frontend:** SPA leve em JS puro servida pelo próprio Express (`public/`).
- **Regras de negócio no servidor (em transações):** custo médio ponderado móvel, baixa de estoque **somente na aprovação** da requisição e registro de **divergência** (solicitado × real).

### Perfis
| Perfil | Pode |
|---|---|
| **Atendente** | Criar requisições (entram como *pendentes*); ver painel, requisições e kardex |
| **Almoxarifado** | Tudo do atendente **+** entradas, ajustes, cadastros e **aprovar/rejeitar** requisições |
| **Administrador** | Tudo **+** gestão de hotéis e usuários |

---

## Deploy no Render + Neon.tech (passo a passo)

### 1. Banco no Neon
1. Crie uma conta em **neon.tech** e um **Project** (escolha a região mais próxima).
2. No painel do projeto, em **Connection Details**, selecione a opção **"Pooled connection"** e copie a *connection string*. Ela se parece com:
   ```
   postgresql://usuario:senha@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   > Use sempre a versão **-pooler** (PgBouncer) para apps web — combina com o pool deste backend.

### 2. App no Render
**Opção A — Blueprint (recomendado):** o repositório já traz `render.yaml`.
1. Suba o projeto para um repositório no GitHub.
2. No Render: **New → Blueprint** e aponte para o repositório.
3. O Render lê o `render.yaml` e pede os valores marcados como `sync:false`:
   - **DATABASE_URL** → cole a string *pooled* do Neon.
   - **ADMIN_PASSWORD** → defina a senha inicial do admin.
   - (**JWT_SECRET** é gerado automaticamente.)
4. **Create** → o serviço builda, cria as tabelas e sobe. A URL pública já vem com HTTPS.

**Opção B — Manual:** **New → Web Service** apontando para o repo, com:
- Runtime **Node**, Build `npm install`, Start `npm start`, Health check `/api/health`.
- Variáveis: `NODE_ENV=production`, `DATABASE_URL` (Neon pooled), `PGSSL=true`, `JWT_SECRET` (gere um valor longo), `ADMIN_PASSWORD`, `DB_POOL_MAX=8`.

> O plano **free** do Render hiberna após inatividade; a primeira requisição "acorda" o serviço (e o Neon). Para evitar, use um plano pago ou um ping periódico.

---

## Rodar localmente

**Com Docker (app + Postgres juntos):**
```bash
cp .env.example .env        # ajuste senhas e JWT_SECRET
docker compose up --build   # http://localhost:3000
```

**Com Node + um Postgres qualquer:**
```bash
npm install
cp .env.example .env        # aponte DATABASE_URL ou as variáveis PG*
npm start
```
Na primeira execução o schema é criado e o admin é gerado (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

---

## Estrutura
```
almoxarifado-cloud/
├── render.yaml            # blueprint do Render
├── package.json
├── .node-version          # Node 20
├── Dockerfile             # uso local/VPS
├── docker-compose.yml     # app + postgres p/ desenvolvimento
├── .env.example
├── src/
│   ├── server.js          # API REST (helmet, gzip, auth, regras)
│   ├── db.js              # pool PostgreSQL (SSL/Neon), schema, seed
│   └── schema.sql         # esquema relacional + índices
└── public/                # index.html, styles.css, app.js (SPA)
```

## Variáveis de ambiente (principais)
| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Connection string do Neon (pooled). Tem prioridade sobre `PG*`. |
| `PGSSL` | `true` em provedores gerenciados (Neon). |
| `JWT_SECRET` | Segredo para assinar os tokens. **Defina um valor forte.** |
| `JWT_EXPIRES` | Validade do token (padrão `12h`). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin criado só na 1ª execução. |
| `DB_POOL_MAX` | Tamanho do pool (padrão 8; mantenha baixo no Neon). |
| `PORT` | Porta (o Render define automaticamente). |

## Primeiros passos no sistema
1. Entre como **admin** (senha do `ADMIN_PASSWORD`).
2. Em **Hotéis**, cadastre os hotéis.
3. Em **Usuários**, crie atendentes/almoxarifes e **vincule** cada um aos hotéis (trocam a senha no 1º acesso).
4. Cada usuário escolhe o hotel ao entrar; admin enxerga todos.

## Segurança
- Troque `JWT_SECRET` e a senha do admin antes de expor.
- Use sempre **HTTPS** (no Render já é padrão).
- Faça **backup** do banco — no Neon há *branching*/snapshots; localmente use `pg_dump`.
- Senhas ficam apenas como hash bcrypt.

## API (resumo)
- `POST /api/auth/login` · `POST /api/auth/change-password` · `GET /api/me` · `GET /api/health`
- `GET/POST/PUT/DELETE /api/hoteis` · `GET/POST/PUT/DELETE /api/usuarios` *(admin)*
- Por hotel (`/api/hoteis/:hotelId/...`): `dashboard`, `itens`, `categorias`, `fornecedores`,
  `entradas`, `requisicoes` (+ `/:id`, `/:id/aprovar`, `/:id/rejeitar`), `ajustes`, `movimentacoes`.

## Próximos incrementos (opcionais, sobre esta mesma base)
Importação por Excel, central de relatórios em PDF (a requisição já imprime pelo navegador), contagem mensal e curva ABC. A estrutura de dados e a API já comportam.
