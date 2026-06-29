# Deploy no Heroku — passo a passo

> Atenção: o Heroku **não tem mais plano gratuito**. Custo mínimo: dyno **Eco US$5/mês** (ou **Basic US$7/mês**, sem hibernar) + **Heroku Postgres Essential-0 US$5/mês**. Total ~US$10–12/mês.

Este projeto já vem pronto para o Heroku: tem `Procfile`, a versão do Node fixada no `package.json` e o banco liga SSL sozinho quando existe `DATABASE_URL`. O schema e o usuário admin são criados automaticamente na primeira vez que o app sobe.

## 1. Pré-requisitos
- Conta no Heroku: https://signup.heroku.com
- Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
- Git instalado.

## 2. Entrar e iniciar o repositório
Na pasta do projeto (onde está o `package.json`):
```bash
heroku login
git init
git add .
git commit -m "Almoxarifado Cloud"
```

## 3. Criar o app
```bash
heroku create almoxarifado-rafael      # escolha um nome único (ou deixe o Heroku gerar)
```
Isso cria o app e adiciona o remoto `heroku` ao git.

## 4. Adicionar o banco PostgreSQL
```bash
heroku addons:create heroku-postgresql:essential-0
```
O Heroku cria o banco e define a variável `DATABASE_URL` automaticamente.

## 5. Definir as variáveis de ambiente (config vars)
```bash
heroku config:set JWT_SECRET="$(openssl rand -hex 32)"
heroku config:set ADMIN_USERNAME=admin
heroku config:set ADMIN_PASSWORD=rafa1411
heroku config:set NODE_ENV=production
```
(No Windows sem `openssl`, troque por qualquer texto longo e aleatório em `JWT_SECRET`.)
Não é preciso definir `PGSSL`: com `DATABASE_URL` presente, o SSL liga sozinho.

## 6. Publicar
```bash
git push heroku main
```
> Se o seu branch se chamar `master`, use `git push heroku master`.

O Heroku detecta o Node pelo `package.json`, instala as dependências e sobe o app. Na primeira execução, o `db.js` cria as tabelas e o usuário admin.

## 7. Abrir e conferir
```bash
heroku open            # abre o app no navegador
heroku logs --tail     # acompanha os logs (útil se algo falhar)
```
Entre com **admin / rafa1411** (a senha que você definiu) e troque a senha no primeiro acesso.

---

## Alternativa: deploy pela interface (GitHub, sem CLI)
1. Suba o projeto para um repositório no GitHub.
2. No painel do Heroku: **New → Create new app**.
3. Aba **Resources** → em Add-ons, busque **Heroku Postgres** → plano **Essential 0**.
4. Aba **Settings → Config Vars**: adicione `JWT_SECRET`, `ADMIN_PASSWORD`, `NODE_ENV=production`.
5. Aba **Deploy → Deployment method → GitHub**, conecte o repositório e clique **Deploy Branch** (ou ative **Automatic deploys**).

---

## Atualizar o app depois
```bash
git add .
git commit -m "ajustes"
git push heroku main
```

## Comandos úteis
```bash
heroku logs --tail                 # logs em tempo real
heroku ps                          # status dos dynos
heroku pg:info                     # informações do banco
heroku pg:psql                     # abre um console SQL no banco
heroku config                      # lista as variáveis de ambiente
heroku pg:backups:capture          # backup manual do banco
heroku ps:scale web=1              # garante 1 dyno web ativo
```

## Observações
- **Dyno Eco hiberna** após 30 min sem acesso (demora alguns segundos para acordar). Para evitar, use **Basic**: `heroku ps:type basic`.
- **Backups:** o Heroku Postgres Essential já faz backups; para um manual, use `heroku pg:backups:capture` e baixe com `heroku pg:backups:download`.
- O `Dockerfile` do projeto é ignorado nesse fluxo (o Heroku usa o buildpack de Node). Ele continua válido para rodar via Docker/`docker compose` em outros lugares.
