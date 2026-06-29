'use strict';
/* ============================================================
   db.js — conexão PostgreSQL (otimizada p/ Neon.tech serverless),
   criação do schema e seed inicial.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const hasUrl = !!process.env.DATABASE_URL;

// SSL: o Neon exige SSL. Quando há DATABASE_URL, liga SSL por padrão
// (use PGSSL=false só para um Postgres local sem TLS).
function sslConfig() {
  if (hasUrl) return process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false };
  return String(process.env.PGSSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false;
}

const pool = new Pool(
  Object.assign(
    hasUrl
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          user: process.env.PGUSER || 'almox',
          password: process.env.PGPASSWORD || 'almox',
          database: process.env.PGDATABASE || 'almoxarifado',
        },
    {
      ssl: sslConfig(),
      // Pool enxuto: Neon (e o pooler PgBouncer) têm limite de conexões.
      max: Number(process.env.DB_POOL_MAX || 8),
      idleTimeoutMillis: Number(process.env.DB_IDLE_MS || 30000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
      keepAlive: true,
      allowExitOnIdle: false,
    }
  )
);

pool.on('error', (err) => console.error('Erro inesperado no pool do PostgreSQL:', err.message));

const query = (text, params) => pool.query(text, params);

// Executa uma função dentro de uma transação (BEGIN/COMMIT/ROLLBACK).
// Compatível com o endpoint "-pooler" do Neon (PgBouncer em modo transação).
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

// Cria as tabelas/índices (idempotente) a partir do schema.sql.
async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema verificado/criado com sucesso.');
}

// Cria o usuário admin inicial caso ainda não exista nenhum usuário.
async function seedAdmin() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (rows[0].n > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const senha = process.env.ADMIN_PASSWORD || 'rafa1411';
  const hash = await bcrypt.hash(senha, 10);
  await pool.query(
    `INSERT INTO usuarios (username, nome, senha_hash, role, ativo, must_change_password)
     VALUES ($1, $2, $3, 'admin', TRUE, FALSE)`,
    [username, 'Administrador', hash]
  );
  console.log(`Usuário admin criado: ${username} (senha via ADMIN_PASSWORD).`);
}

async function init() {
  // Tenta conectar com algumas tentativas (Neon pode estar "frio"/suspenso).
  const tentativas = Number(process.env.DB_CONNECT_RETRIES || 15);
  for (let i = 1; i <= tentativas; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) {
      if (i === tentativas) throw e;
      console.log(`Aguardando o banco… (${i}/${tentativas}) ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await initSchema();
  await seedAdmin();
}

module.exports = { pool, query, withTx, init, initSchema, seedAdmin };

// Permite "npm run init-db" para preparar o banco manualmente.
if (require.main === module && process.argv.includes('--init')) {
  require('dotenv').config();
  init()
    .then(() => { console.log('Banco inicializado.'); process.exit(0); })
    .catch((e) => { console.error('Falha ao inicializar o banco:', e); process.exit(1); });
}
