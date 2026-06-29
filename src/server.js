'use strict';
/* ============================================================
   server.js — API REST do Almoxarifado Cloud
   Node + Express + PostgreSQL · JWT + bcrypt · 3 perfis
   Desenvolvido por Rafael Almeida.
   ============================================================ */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';
const PROD = process.env.NODE_ENV === 'production';
if (PROD && JWT_SECRET === 'troque-este-segredo-em-producao') {
  console.warn('⚠️  JWT_SECRET não definido em produção — defina um segredo forte na variável de ambiente!');
}

app.set('trust proxy', 1); // Render/Neon ficam atrás de proxy (IP/HTTPS corretos)
// CSP desligada porque o front usa handlers inline (onclick); demais proteções do helmet ativas.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Wrapper para rotas assíncronas (encaminha erros ao handler central).
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Erro com status HTTP.
const fail = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
// Valida UUID para evitar erro 500 do Postgres em ids malformados.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Health-check (usado pelo Render).
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ---------------- Autenticação / autorização ---------------- */
function signToken(u) {
  return jwt.sign({ id: u.id, username: u.username, role: u.role, nome: u.nome }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão para esta ação.' });
    next();
  };
}
const isAdmin = (req) => req.user && req.user.role === 'admin';
const canApprove = (req) => req.user && (req.user.role === 'admin' || req.user.role === 'almoxarifado');

// Garante que o usuário tem acesso ao hotel da URL (:hotelId). Admin acessa todos.
const requireHotelAccess = h(async (req, res, next) => {
  const hotelId = req.params.hotelId;
  if (!isUuid(hotelId)) throw fail(404, 'Hotel não encontrado.');
  const hot = await db.query('SELECT id, nome, ativo FROM hoteis WHERE id=$1', [hotelId]);
  if (!hot.rows.length) throw fail(404, 'Hotel não encontrado.');
  if (!isAdmin(req)) {
    const link = await db.query('SELECT 1 FROM usuario_hoteis WHERE usuario_id=$1 AND hotel_id=$2', [req.user.id, hotelId]);
    if (!link.rows.length) throw fail(403, 'Você não tem acesso a este hotel.');
  }
  req.hotel = hot.rows[0];
  next();
});

/* ---------------- Helpers de domínio ---------------- */
async function ensureCounter(client, hotelId) {
  await client.query('INSERT INTO doc_counters (hotel_id) VALUES ($1) ON CONFLICT (hotel_id) DO NOTHING', [hotelId]);
}
async function nextNumero(client, hotelId, field, prefix) {
  const col = { req: 'prox_req', ent: 'prox_ent', cont: 'prox_contagem' }[field];
  await ensureCounter(client, hotelId);
  const r = await client.query(`UPDATE doc_counters SET ${col}=${col}+1 WHERE hotel_id=$1 RETURNING (${col}-1) AS n`, [hotelId]);
  return prefix + String(r.rows[0].n).padStart(4, '0');
}

// Registra um movimento e atualiza saldo + custo médio ponderado móvel. Use dentro de transação.
async function registrarMovimento(client, hotelId, m) {
  const it = (await client.query('SELECT * FROM itens WHERE id=$1 AND hotel_id=$2 FOR UPDATE', [m.itemId, hotelId])).rows[0];
  if (!it) throw fail(400, 'Item não encontrado para movimentação.');
  let estoque = Number(it.estoque_atual);
  let custoMedio = Number(it.custo_medio);
  let custoUnit = Number(m.custoUnitario || 0);
  const qtd = Number(m.quantidade);

  if (m.tipo === 'entrada') {
    const totalAntes = estoque * custoMedio;
    estoque += qtd;
    if (custoUnit > 0) custoMedio = estoque > 0 ? (totalAntes + qtd * custoUnit) / estoque : custoUnit;
  } else if (m.tipo === 'saida') {
    if (qtd > estoque) throw fail(400, `Estoque insuficiente para "${it.descricao}". Disponível: ${estoque} ${it.unidade}.`);
    estoque -= qtd;
    custoUnit = custoMedio;
  } else if (m.tipo === 'ajuste') {
    estoque = qtd; // ajuste define o saldo absoluto
  }

  await client.query('UPDATE itens SET estoque_atual=$1, custo_medio=$2 WHERE id=$3', [estoque, custoMedio, it.id]);
  await client.query(
    `INSERT INTO movimentacoes (hotel_id,item_id,data,tipo,quantidade,custo_unitario,saldo_apos,documento,origem,obs,usuario)
     VALUES ($1,$2,COALESCE($3,now()),$4,$5,$6,$7,$8,$9,$10,$11)`,
    [hotelId, it.id, m.data || null, m.tipo, qtd, custoUnit, estoque, m.documento || '', m.origem || '', m.obs || '', m.usuario || '']
  );
  return { estoqueAtual: estoque, custoMedio };
}

// SELECT de item com campos em camelCase (para o frontend).
const ITEM_COLS = `id, codigo, descricao, unidade, categoria_id AS "categoriaId", localizacao,
  estoque_atual::float AS "estoqueAtual", estoque_minimo::float AS "estoqueMinimo",
  custo_medio::float AS "custoMedio", ativo, criado_em AS "criadoEm"`;

/* ============================================================
   ROTAS — AUTENTICAÇÃO
   ============================================================ */
app.post('/api/auth/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw fail(400, 'Informe usuário e senha.');
  const u = (await db.query('SELECT * FROM usuarios WHERE lower(username)=lower($1)', [username])).rows[0];
  if (!u || u.ativo === false) throw fail(401, 'Usuário ou senha inválidos.');
  const ok = await bcrypt.compare(password, u.senha_hash);
  if (!ok) throw fail(401, 'Usuário ou senha inválidos.');
  const hoteis = await hoteisDoUsuario(u);
  res.json({
    token: signToken(u),
    user: { id: u.id, username: u.username, nome: u.nome, role: u.role, mustChangePassword: u.must_change_password },
    hoteis,
  });
}));

app.post('/api/auth/change-password', requireAuth, h(async (req, res) => {
  const { atual, nova } = req.body || {};
  if (!nova || String(nova).length < 4) throw fail(400, 'A nova senha deve ter ao menos 4 caracteres.');
  const u = (await db.query('SELECT * FROM usuarios WHERE id=$1', [req.user.id])).rows[0];
  if (!u) throw fail(404, 'Usuário não encontrado.');
  // Se não é troca obrigatória, exige a senha atual.
  if (!u.must_change_password) {
    const ok = await bcrypt.compare(atual || '', u.senha_hash);
    if (!ok) throw fail(400, 'Senha atual incorreta.');
  }
  const hash = await bcrypt.hash(String(nova), 10);
  await db.query('UPDATE usuarios SET senha_hash=$1, must_change_password=FALSE WHERE id=$2', [hash, u.id]);
  res.json({ ok: true });
}));

app.get('/api/me', requireAuth, h(async (req, res) => {
  const u = (await db.query('SELECT * FROM usuarios WHERE id=$1', [req.user.id])).rows[0];
  if (!u) throw fail(404, 'Usuário não encontrado.');
  res.json({ user: { id: u.id, username: u.username, nome: u.nome, role: u.role }, hoteis: await hoteisDoUsuario(u) });
}));

async function hoteisDoUsuario(u) {
  if (u.role === 'admin') {
    return (await db.query('SELECT id, codigo, nome, cidade FROM hoteis WHERE ativo=TRUE ORDER BY nome')).rows;
  }
  return (await db.query(
    `SELECT h.id, h.codigo, h.nome, h.cidade FROM hoteis h
       JOIN usuario_hoteis uh ON uh.hotel_id=h.id
      WHERE uh.usuario_id=$1 AND h.ativo=TRUE ORDER BY h.nome`,
    [u.id]
  )).rows;
}

/* ============================================================
   ROTAS — HOTÉIS (admin)
   ============================================================ */
app.get('/api/hoteis', requireAuth, requireRole('admin'), h(async (req, res) => {
  const rows = (await db.query(`
    SELECT h.id, h.codigo, h.nome, h.cidade, h.ativo, h.criado_em AS "criadoEm",
           (SELECT COUNT(*)::int FROM itens i WHERE i.hotel_id=h.id) AS "qtdItens",
           COALESCE((SELECT SUM(i.estoque_atual*i.custo_medio) FROM itens i WHERE i.hotel_id=h.id),0)::float AS "valorEstoque"
      FROM hoteis h ORDER BY h.nome`)).rows;
  res.json(rows);
}));
app.post('/api/hoteis', requireAuth, requireRole('admin'), h(async (req, res) => {
  const { codigo, nome, cidade } = req.body || {};
  if (!nome) throw fail(400, 'Informe o nome do hotel.');
  const r = await db.withTx(async (c) => {
    const ins = await c.query('INSERT INTO hoteis (codigo,nome,cidade) VALUES ($1,$2,$3) RETURNING id', [codigo || '', nome, cidade || '']);
    await c.query('INSERT INTO doc_counters (hotel_id) VALUES ($1) ON CONFLICT DO NOTHING', [ins.rows[0].id]);
    return ins.rows[0];
  });
  res.status(201).json(r);
}));
app.put('/api/hoteis/:id', requireAuth, requireRole('admin'), h(async (req, res) => {
  const { codigo, nome, cidade, ativo } = req.body || {};
  if (!nome) throw fail(400, 'Informe o nome do hotel.');
  await db.query('UPDATE hoteis SET codigo=$1, nome=$2, cidade=$3, ativo=$4 WHERE id=$5',
    [codigo || '', nome, cidade || '', ativo !== false, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/hoteis/:id', requireAuth, requireRole('admin'), h(async (req, res) => {
  await db.query('DELETE FROM hoteis WHERE id=$1', [req.params.id]); // cascata remove dados do hotel
  res.json({ ok: true });
}));

/* ============================================================
   ROTAS — USUÁRIOS (admin)
   ============================================================ */
app.get('/api/usuarios', requireAuth, requireRole('admin'), h(async (req, res) => {
  const us = (await db.query('SELECT id, username, nome, role, ativo, criado_em AS "criadoEm" FROM usuarios ORDER BY username')).rows;
  const links = (await db.query('SELECT usuario_id, hotel_id FROM usuario_hoteis')).rows;
  const byUser = {};
  links.forEach((l) => { (byUser[l.usuario_id] = byUser[l.usuario_id] || []).push(l.hotel_id); });
  us.forEach((u) => { u.hoteis = byUser[u.id] || []; });
  res.json(us);
}));
app.post('/api/usuarios', requireAuth, requireRole('admin'), h(async (req, res) => {
  let { username, nome, senha, role, hoteis } = req.body || {};
  username = String(username || '').trim().toLowerCase();
  if (!username || !nome) throw fail(400, 'Usuário e nome são obrigatórios.');
  if (!senha || String(senha).length < 4) throw fail(400, 'A senha deve ter ao menos 4 caracteres.');
  if (!['admin', 'almoxarifado', 'atendente'].includes(role)) role = 'atendente';
  hoteis = Array.isArray(hoteis) ? hoteis : [];
  if (role !== 'admin' && hoteis.length === 0) throw fail(400, 'Vincule ao menos um hotel (ou defina como Administrador).');
  const dup = await db.query('SELECT 1 FROM usuarios WHERE lower(username)=$1', [username]);
  if (dup.rows.length) throw fail(409, 'Já existe um usuário com este login.');
  const hash = await bcrypt.hash(String(senha), 10);
  const r = await db.withTx(async (c) => {
    const ins = await c.query(
      `INSERT INTO usuarios (username,nome,senha_hash,role,ativo,must_change_password)
       VALUES ($1,$2,$3,$4,TRUE,TRUE) RETURNING id`, [username, nome, hash, role]);
    for (const hid of hoteis) await c.query('INSERT INTO usuario_hoteis (usuario_id,hotel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ins.rows[0].id, hid]);
    return ins.rows[0];
  });
  res.status(201).json(r);
}));
app.put('/api/usuarios/:id', requireAuth, requireRole('admin'), h(async (req, res) => {
  const u = (await db.query('SELECT * FROM usuarios WHERE id=$1', [req.params.id])).rows[0];
  if (!u) throw fail(404, 'Usuário não encontrado.');
  let { nome, senha, role, ativo, hoteis } = req.body || {};
  if (!nome) throw fail(400, 'Informe o nome.');
  const isRoot = u.username === 'admin';
  if (!isRoot && role && !['admin', 'almoxarifado', 'atendente'].includes(role)) role = 'atendente';
  hoteis = Array.isArray(hoteis) ? hoteis : [];
  const finalRole = isRoot ? 'admin' : (role || u.role);
  if (finalRole !== 'admin' && hoteis.length === 0) throw fail(400, 'Vincule ao menos um hotel (ou defina como Administrador).');
  await db.withTx(async (c) => {
    await c.query('UPDATE usuarios SET nome=$1, role=$2, ativo=$3 WHERE id=$4',
      [nome, finalRole, isRoot ? true : ativo !== false, u.id]);
    if (senha) {
      if (String(senha).length < 4) throw fail(400, 'A senha deve ter ao menos 4 caracteres.');
      const hash = await bcrypt.hash(String(senha), 10);
      const mcp = req.user.id !== u.id; // se admin troca senha de outro, exige troca no 1º acesso
      await c.query('UPDATE usuarios SET senha_hash=$1, must_change_password=$2 WHERE id=$3', [hash, mcp, u.id]);
    }
    await c.query('DELETE FROM usuario_hoteis WHERE usuario_id=$1', [u.id]);
    for (const hid of hoteis) await c.query('INSERT INTO usuario_hoteis (usuario_id,hotel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, hid]);
  });
  res.json({ ok: true });
}));
app.delete('/api/usuarios/:id', requireAuth, requireRole('admin'), h(async (req, res) => {
  const u = (await db.query('SELECT username FROM usuarios WHERE id=$1', [req.params.id])).rows[0];
  if (!u) throw fail(404, 'Usuário não encontrado.');
  if (u.username === 'admin') throw fail(400, 'O usuário admin não pode ser excluído.');
  if (req.params.id === req.user.id) throw fail(400, 'Você não pode excluir o usuário em uso.');
  await db.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

/* ============================================================
   ROTAS POR HOTEL  (/api/hoteis/:hotelId/...)
   ============================================================ */
const hotelRouter = express.Router({ mergeParams: true });
app.use('/api/hoteis/:hotelId', requireAuth, requireHotelAccess, hotelRouter);

// ----- Dashboard -----
hotelRouter.get('/dashboard', h(async (req, res) => {
  const hid = req.params.hotelId;
  const itens = (await db.query(`SELECT ${ITEM_COLS} FROM itens WHERE hotel_id=$1`, [hid])).rows;
  const baixos = itens.filter((i) => i.ativo !== false && i.estoqueAtual <= i.estoqueMinimo);
  const valor = itens.reduce((s, i) => s + i.estoqueAtual * (i.custoMedio || 0), 0);
  const pend = (await db.query(`SELECT COUNT(*)::int AS n FROM requisicoes WHERE hotel_id=$1 AND status='pendente'`, [hid])).rows[0].n;
  const recentes = (await db.query(
    `SELECT m.id, m.data, m.tipo, m.quantidade::float AS quantidade, i.descricao
       FROM movimentacoes m JOIN itens i ON i.id=m.item_id
      WHERE m.hotel_id=$1 ORDER BY m.data DESC LIMIT 8`, [hid])).rows;
  res.json({
    totalItens: itens.length,
    ativos: itens.filter((i) => i.ativo !== false).length,
    zerados: itens.filter((i) => i.estoqueAtual <= 0).length,
    valorEstoque: valor,
    estoqueBaixo: baixos.length,
    requisicoesPendentes: pend,
    alertas: baixos.slice(0, 8),
    recentes,
  });
}));

// ----- Categorias -----
hotelRouter.get('/categorias', h(async (req, res) => {
  res.json((await db.query('SELECT id, nome FROM categorias WHERE hotel_id=$1 ORDER BY nome', [req.params.hotelId])).rows);
}));
hotelRouter.post('/categorias', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const { nome } = req.body || {}; if (!nome) throw fail(400, 'Informe o nome.');
  const r = await db.query('INSERT INTO categorias (hotel_id,nome) VALUES ($1,$2) RETURNING id', [req.params.hotelId, nome]);
  res.status(201).json(r.rows[0]);
}));
hotelRouter.put('/categorias/:id', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const { nome } = req.body || {}; if (!nome) throw fail(400, 'Informe o nome.');
  await db.query('UPDATE categorias SET nome=$1 WHERE id=$2 AND hotel_id=$3', [nome, req.params.id, req.params.hotelId]);
  res.json({ ok: true });
}));
hotelRouter.delete('/categorias/:id', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  await db.query('DELETE FROM categorias WHERE id=$1 AND hotel_id=$2', [req.params.id, req.params.hotelId]);
  res.json({ ok: true });
}));

// ----- Fornecedores -----
hotelRouter.get('/fornecedores', h(async (req, res) => {
  res.json((await db.query('SELECT id, nome, cnpj, contato, telefone, email FROM fornecedores WHERE hotel_id=$1 ORDER BY nome', [req.params.hotelId])).rows);
}));
hotelRouter.post('/fornecedores', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const { nome, cnpj, contato, telefone, email } = req.body || {}; if (!nome) throw fail(400, 'Informe o nome.');
  const r = await db.query('INSERT INTO fornecedores (hotel_id,nome,cnpj,contato,telefone,email) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.params.hotelId, nome, cnpj || '', contato || '', telefone || '', email || '']);
  res.status(201).json(r.rows[0]);
}));
hotelRouter.put('/fornecedores/:id', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const { nome, cnpj, contato, telefone, email } = req.body || {}; if (!nome) throw fail(400, 'Informe o nome.');
  await db.query('UPDATE fornecedores SET nome=$1,cnpj=$2,contato=$3,telefone=$4,email=$5 WHERE id=$6 AND hotel_id=$7',
    [nome, cnpj || '', contato || '', telefone || '', email || '', req.params.id, req.params.hotelId]);
  res.json({ ok: true });
}));
hotelRouter.delete('/fornecedores/:id', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  await db.query('DELETE FROM fornecedores WHERE id=$1 AND hotel_id=$2', [req.params.id, req.params.hotelId]);
  res.json({ ok: true });
}));

// ----- Itens -----
hotelRouter.get('/itens', h(async (req, res) => {
  res.json((await db.query(`SELECT ${ITEM_COLS} FROM itens WHERE hotel_id=$1 ORDER BY descricao`, [req.params.hotelId])).rows);
}));
hotelRouter.post('/itens', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const b = req.body || {};
  if (!b.codigo || !b.descricao) throw fail(400, 'Código e descrição são obrigatórios.');
  const dup = await db.query('SELECT 1 FROM itens WHERE hotel_id=$1 AND lower(codigo)=lower($2)', [req.params.hotelId, b.codigo]);
  if (dup.rows.length) throw fail(409, 'Já existe um item com este código.');
  const estoqueIni = Number(b.estoqueAtual || 0);
  const custoIni = Number(b.custoMedio || 0);
  const out = await db.withTx(async (c) => {
    // Cria o item já com saldo zero; o saldo inicial entra como movimento (Kardex consistente).
    const ins = await c.query(
      `INSERT INTO itens (hotel_id,codigo,descricao,unidade,categoria_id,localizacao,estoque_atual,estoque_minimo,custo_medio,ativo)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,$8) RETURNING id`,
      [req.params.hotelId, b.codigo, b.descricao, b.unidade || 'UN', b.categoriaId || null, b.localizacao || '',
       Number(b.estoqueMinimo || 0), b.ativo !== false]);
    if (estoqueIni > 0) {
      await registrarMovimento(c, req.params.hotelId, {
        itemId: ins.rows[0].id, tipo: 'entrada', quantidade: estoqueIni, custoUnitario: custoIni,
        documento: 'Estoque inicial', origem: 'Cadastro de item', obs: '', usuario: req.user.username });
    }
    return ins.rows[0];
  });
  res.status(201).json(out);
}));
hotelRouter.put('/itens/:id', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const b = req.body || {};
  if (!b.descricao) throw fail(400, 'Informe a descrição.');
  await db.query(
    `UPDATE itens SET descricao=$1, unidade=$2, categoria_id=$3, localizacao=$4, estoque_minimo=$5, ativo=$6
       WHERE id=$7 AND hotel_id=$8`,
    [b.descricao, b.unidade || 'UN', b.categoriaId || null, b.localizacao || '', Number(b.estoqueMinimo || 0), b.ativo !== false, req.params.id, req.params.hotelId]);
  res.json({ ok: true });
  // Obs.: saldo e custo médio só mudam via entradas/requisições/ajustes (integridade do Kardex).
}));
hotelRouter.delete('/itens/:id', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const mv = await db.query('SELECT 1 FROM movimentacoes WHERE item_id=$1 LIMIT 1', [req.params.id]);
  if (mv.rows.length) throw fail(400, 'Este item possui movimentações. Inative-o em vez de excluir, para preservar o histórico.');
  await db.query('DELETE FROM itens WHERE id=$1 AND hotel_id=$2', [req.params.id, req.params.hotelId]);
  res.json({ ok: true });
}));

// ----- Movimentações (Kardex) -----
hotelRouter.get('/movimentacoes', h(async (req, res) => {
  const params = [req.params.hotelId];
  let sql = `SELECT m.id, m.data, m.tipo, m.quantidade::float AS quantidade, m.custo_unitario::float AS "custoUnitario",
                    m.saldo_apos::float AS "saldoApos", m.documento, m.origem, m.obs, m.usuario,
                    i.codigo AS "itemCodigo", i.descricao AS "itemDescricao", i.unidade
               FROM movimentacoes m JOIN itens i ON i.id=m.item_id WHERE m.hotel_id=$1`;
  if (req.query.itemId) { params.push(req.query.itemId); sql += ` AND m.item_id=$${params.length}`; }
  sql += ' ORDER BY m.data DESC LIMIT 500';
  res.json((await db.query(sql, params)).rows);
}));

// ----- Entradas -----
hotelRouter.get('/entradas', h(async (req, res) => {
  const es = (await db.query(
    `SELECT e.id, e.numero, e.data, e.nota_fiscal AS "notaFiscal", e.obs, f.nome AS "fornecedorNome",
            (SELECT COUNT(*)::int FROM entrada_itens ei WHERE ei.entrada_id=e.id) AS "qtdItens"
       FROM entradas e LEFT JOIN fornecedores f ON f.id=e.fornecedor_id
      WHERE e.hotel_id=$1 ORDER BY e.data DESC`, [req.params.hotelId])).rows;
  res.json(es);
}));
hotelRouter.post('/entradas', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const b = req.body || {};
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) throw fail(400, 'Adicione ao menos um item.');
  const out = await db.withTx(async (c) => {
    const numero = await nextNumero(c, req.params.hotelId, 'ent', 'ENT-');
    const ent = await c.query(
      `INSERT INTO entradas (hotel_id,numero,data,fornecedor_id,nota_fiscal,obs)
       VALUES ($1,$2,COALESCE($3,now()),$4,$5,$6) RETURNING id`,
      [req.params.hotelId, numero, b.data || null, b.fornecedorId || null, b.notaFiscal || '', b.obs || '']);
    for (const l of itens) {
      await c.query('INSERT INTO entrada_itens (entrada_id,item_id,quantidade,custo_unitario) VALUES ($1,$2,$3,$4)',
        [ent.rows[0].id, l.itemId, Number(l.quantidade), Number(l.custoUnitario || 0)]);
      await registrarMovimento(c, req.params.hotelId, {
        itemId: l.itemId, tipo: 'entrada', quantidade: Number(l.quantidade), custoUnitario: Number(l.custoUnitario || 0),
        documento: numero, origem: 'Entrada' + (b.notaFiscal ? ' NF ' + b.notaFiscal : ''), obs: '', usuario: req.user.username, data: b.data || null });
    }
    return { id: ent.rows[0].id, numero };
  });
  res.status(201).json(out);
}));

// ----- Requisições (com aprovação) -----
hotelRouter.get('/requisicoes', h(async (req, res) => {
  const rs = (await db.query(
    `SELECT r.id, r.numero, r.data, r.requisitante, r.setor, r.obs, r.status,
            r.criado_por AS "criadoPor", r.aprovado_por AS "aprovadoPor", r.aprovado_em AS "aprovadoEm",
            (SELECT COUNT(*)::int FROM requisicao_itens ri WHERE ri.requisicao_id=r.id) AS "qtdItens",
            COALESCE((SELECT SUM(COALESCE(ri.quantidade_real,ri.quantidade)*ri.custo_unitario) FROM requisicao_itens ri WHERE ri.requisicao_id=r.id),0)::float AS valor
       FROM requisicoes r WHERE r.hotel_id=$1 ORDER BY r.data DESC`, [req.params.hotelId])).rows;
  res.json(rs);
}));
hotelRouter.get('/requisicoes/:id', h(async (req, res) => {
  const r = (await db.query('SELECT *, aprovado_em AS "aprovadoEm", criado_por AS "criadoPor", aprovado_por AS "aprovadoPor" FROM requisicoes WHERE id=$1 AND hotel_id=$2', [req.params.id, req.params.hotelId])).rows[0];
  if (!r) throw fail(404, 'Requisição não encontrada.');
  r.itens = (await db.query(
    `SELECT ri.id AS "linhaId", ri.item_id AS "itemId", ri.quantidade::float AS quantidade, ri.quantidade_real::float AS "quantidadeReal",
            ri.custo_unitario::float AS "custoUnitario", i.descricao, i.unidade, i.codigo
       FROM requisicao_itens ri JOIN itens i ON i.id=ri.item_id WHERE ri.requisicao_id=$1`, [req.params.id])).rows;
  res.json(r);
}));
// Qualquer perfil autenticado e com acesso ao hotel pode criar (entra como pendente).
hotelRouter.post('/requisicoes', h(async (req, res) => {
  const b = req.body || {};
  if (!b.requisitante) throw fail(400, 'Informe o solicitante.');
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) throw fail(400, 'Adicione ao menos um item.');
  const out = await db.withTx(async (c) => {
    const numero = await nextNumero(c, req.params.hotelId, 'req', 'REQ-');
    const reqRow = await c.query(
      `INSERT INTO requisicoes (hotel_id,numero,data,requisitante,setor,obs,status,criado_por)
       VALUES ($1,$2,COALESCE($3,now()),$4,$5,$6,'pendente',$7) RETURNING id`,
      [req.params.hotelId, numero, b.data || null, b.requisitante, b.setor || '', b.obs || '', req.user.username]);
    for (const l of itens) {
      const it = (await c.query('SELECT custo_medio FROM itens WHERE id=$1 AND hotel_id=$2', [l.itemId, req.params.hotelId])).rows[0];
      if (!it) throw fail(400, 'Item inválido na requisição.');
      await c.query('INSERT INTO requisicao_itens (requisicao_id,item_id,quantidade,custo_unitario) VALUES ($1,$2,$3,$4)',
        [reqRow.rows[0].id, l.itemId, Number(l.quantidade), Number(it.custo_medio)]);
    }
    return { id: reqRow.rows[0].id, numero };
  });
  res.status(201).json(out);
}));
// Aprovar: somente admin/almoxarifado. Informa a quantidade real e abate o estoque.
hotelRouter.post('/requisicoes/:id/aprovar', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const reais = (req.body && req.body.reais) || {}; // { requisicaoItemId | itemId : quantidadeReal }
  const obsAprov = (req.body && req.body.obs) || '';
  await db.withTx(async (c) => {
    const r = (await c.query('SELECT * FROM requisicoes WHERE id=$1 AND hotel_id=$2 FOR UPDATE', [req.params.id, req.params.hotelId])).rows[0];
    if (!r) throw fail(404, 'Requisição não encontrada.');
    if (r.status !== 'pendente') throw fail(400, 'Esta requisição não está pendente.');
    const linhas = (await c.query('SELECT * FROM requisicao_itens WHERE requisicao_id=$1', [r.id])).rows;
    for (const l of linhas) {
      const qReal = reais[l.id] != null ? Number(reais[l.id]) : Number(l.quantidade);
      if (qReal < 0) throw fail(400, 'Quantidade real inválida.');
      await c.query('UPDATE requisicao_itens SET quantidade_real=$1 WHERE id=$2', [qReal, l.id]);
      if (qReal > 0) {
        await registrarMovimento(c, req.params.hotelId, {
          itemId: l.item_id, tipo: 'saida', quantidade: qReal, documento: r.numero,
          origem: 'Requisição ' + (r.setor || r.requisitante), obs: 'Aprovada por ' + req.user.username, usuario: req.user.username });
      }
    }
    const obs = obsAprov ? (r.obs ? r.obs + ' · ' : '') + 'Aprovação: ' + obsAprov : r.obs;
    await c.query(`UPDATE requisicoes SET status='aprovada', aprovado_por=$1, aprovado_em=now(), obs=$2 WHERE id=$3`,
      [req.user.username, obs, r.id]);
  });
  res.json({ ok: true });
}));
// Rejeitar: somente admin/almoxarifado. Não movimenta estoque.
hotelRouter.post('/requisicoes/:id/rejeitar', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const motivo = (req.body && req.body.motivo) || '';
  const r = (await db.query('SELECT * FROM requisicoes WHERE id=$1 AND hotel_id=$2', [req.params.id, req.params.hotelId])).rows[0];
  if (!r) throw fail(404, 'Requisição não encontrada.');
  if (r.status !== 'pendente') throw fail(400, 'Esta requisição não está pendente.');
  const obs = motivo ? (r.obs ? r.obs + ' · ' : '') + 'Rejeição: ' + motivo : r.obs;
  await db.query(`UPDATE requisicoes SET status='rejeitada', aprovado_por=$1, aprovado_em=now(), obs=$2 WHERE id=$3`,
    [req.user.username, obs, r.id]);
  res.json({ ok: true });
}));

// ----- Ajuste de inventário -----
hotelRouter.post('/ajustes', requireRole('admin', 'almoxarifado'), h(async (req, res) => {
  const b = req.body || {};
  if (!b.itemId) throw fail(400, 'Selecione o item.');
  await db.withTx(async (c) => {
    await registrarMovimento(c, req.params.hotelId, {
      itemId: b.itemId, tipo: 'ajuste', quantidade: Number(b.novoSaldo || 0), custoUnitario: 0,
      documento: 'AJUSTE', origem: 'Ajuste de inventário', obs: b.obs || '', usuario: req.user.username });
  });
  res.json({ ok: true });
}));

/* ============================================================
   Frontend estático + fallback de SPA + erros
   ============================================================ */
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '15m', etag: true }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Handler central de erros.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('Erro:', err);
  res.status(status).json({ error: err.message || 'Erro interno do servidor.' });
});

// Sobe o servidor após preparar o banco.
db.init()
  .then(() => app.listen(PORT, () => console.log(`Almoxarifado Cloud rodando na porta ${PORT}`)))
  .catch((e) => { console.error('Falha ao iniciar (banco indisponível?):', e.message); process.exit(1); });

module.exports = app;
