'use strict';
/* ============================================================
   Almoxarifado Cloud — frontend (SPA leve, sem framework)
   Consome a API REST. Token JWT guardado no localStorage.
   Desenvolvido por Rafael Almeida.
   ============================================================ */

/* ---------------- Estado ---------------- */
const State = {
  token: localStorage.getItem('almox_token') || null,
  user: JSON.parse(localStorage.getItem('almox_user') || 'null'),
  hoteis: [],
  hotel: JSON.parse(localStorage.getItem('almox_hotel') || 'null'),
  page: 'painel',
};
function setSession(token, user) {
  State.token = token; State.user = user;
  localStorage.setItem('almox_token', token);
  localStorage.setItem('almox_user', JSON.stringify(user));
}
function setHotel(h) {
  State.hotel = h;
  if (h) localStorage.setItem('almox_hotel', JSON.stringify(h)); else localStorage.removeItem('almox_hotel');
}
function clearSession() {
  State.token = State.user = State.hotel = null;
  localStorage.removeItem('almox_token'); localStorage.removeItem('almox_user'); localStorage.removeItem('almox_hotel');
}
const isAdmin = () => State.user && State.user.role === 'admin';
const canApprove = () => State.user && (State.user.role === 'admin' || State.user.role === 'almoxarifado');
const canStock = () => canApprove();
const roleLabel = (r) => r === 'admin' ? 'Administrador' : r === 'almoxarifado' ? 'Almoxarifado' : 'Atendente';

/* ---------------- Cliente da API ---------------- */
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (State.token) headers.Authorization = 'Bearer ' + State.token;
  const res = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (res.status === 401) { clearSession(); renderLogin(); throw new Error((data && data.error) || 'Sessão expirada.'); }
    throw new Error((data && data.error) || 'Erro na requisição.');
  }
  return data;
}
const hpath = (p) => `/hoteis/${State.hotel.id}${p}`;
const getH = (p) => api(hpath(p));
const postH = (p, body) => api(hpath(p), { method: 'POST', body });
const putH = (p, body) => api(hpath(p), { method: 'PUT', body });
const delH = (p) => api(hpath(p), { method: 'DELETE' });

/* ---------------- Utils ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const fmtMoney = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const todayInput = () => new Date().toISOString().slice(0, 10);
const initials = (s) => String(s || '?').trim().slice(0, 2).toUpperCase();

const I = {
  dash: '<path d="M3 13h8V3H3zM13 21h8v-6h-8zM13 3v8h8V3zM3 21h8v-4H3z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  in: '<path d="M12 5v14M5 12l7 7 7-7"/>', out: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  ledger: '<path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><path d="M8 8h7M8 12h7"/>',
  truck: '<path d="M1 3h13v10H1zM14 8h4l3 3v2h-7z"/><circle cx="5.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1L9.5 22h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>', check: '<path d="M20 6L9 17l-5-5"/>', alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  approve: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01 9 11.01"/>',
  reject: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  hotel: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h6v6H9z"/>',
  tag: '<path d="M20 10 12 2H4v8l8 8z"/><circle cx="7" cy="7" r="1.5"/>',
  adj: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  swap: '<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
};
const svg = (p, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

/* ---------------- Tema (claro/escuro) ---------------- */
const isDark = () => document.documentElement.dataset.theme === 'dark';
function themeBtn(cls) {
  return `<button class="theme-btn ${cls || ''}" onclick="toggleTheme()" title="${isDark() ? 'Modo claro' : 'Modo escuro'}" aria-label="Alternar tema claro/escuro"><span>${isDark() ? '☀' : '☾'}</span></button>`;
}
function toggleTheme() {
  const html = document.documentElement;
  const next = isDark() ? 'light' : 'dark';
  html.classList.add('theme-anim');
  html.dataset.theme = next;
  try { localStorage.setItem('almox.theme', next); } catch (e) {}
  setTimeout(() => html.classList.remove('theme-anim'), 480);
  document.querySelectorAll('.theme-btn').forEach((b) => {
    b.innerHTML = `<span>${next === 'dark' ? '☀' : '☾'}</span>`;
    b.title = next === 'dark' ? 'Modo claro' : 'Modo escuro';
  });
}

/* ---------------- Toast / Modal ---------------- */
function toast(msg, type) {
  const el = document.createElement('div'); el.className = 'toast ' + (type || ''); el.textContent = msg;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 3600);
}
let onConfirm = null;
function openModal(title, bodyHtml, confirmFn, size, confirmLabel) {
  onConfirm = confirmFn;
  $('modalRoot').innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal ${size === 'wide' ? 'wide' : ''}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" onclick="closeModal()">${svg(I.x)}</button></div>
      <div class="modal-body"><div id="modalErr"></div>${bodyHtml}</div>
      ${confirmFn ? `<div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" id="modalOk">${esc(confirmLabel || 'Salvar')}</button></div>` : ''}
    </div></div>`;
  if (confirmFn) $('modalOk').onclick = async () => { try { await onConfirm(); } catch (e) { modalErr(e.message); } };
}
function openInfo(title, bodyHtml) { openModal(title, bodyHtml, null, 'wide'); }
function closeModal() { $('modalRoot').innerHTML = ''; onConfirm = null; }
function modalErr(msg) { const e = $('modalErr'); if (e) e.innerHTML = `<div class="modal-err">${esc(msg)}</div>`; }
function confirmar(title, msg, fn, label) {
  openModal(title, `<p>${esc(msg)}</p>`, async () => { await fn(); }, null, label || 'Confirmar');
}
const val = (id) => { const e = $(id); return e ? e.value.trim() : ''; };

/* ============================================================
   LOGIN
   ============================================================ */
function renderLogin() {
  setHotel(null);
  document.getElementById('modalRoot').innerHTML = '';
  $('root').innerHTML = `
    <div class="gate">
      <div class="gate-tools">${themeBtn()}<button class="theme-btn" onclick="ajuda()" title="Dúvidas e suporte" aria-label="Ajuda e suporte"><span>?</span></button></div>
      <div class="login-card">
        <div class="login-head"><div class="mk">AX</div><h1>Almoxarifado Cloud</h1><p>Controle de estoque multi-hotel</p></div>
        <div class="login-body">
          <div id="loginErr"></div>
          <div class="field"><label>Usuário</label><input id="lg_user" autocomplete="username" placeholder="seu login"></div>
          <div class="field"><label>Senha</label><input id="lg_pass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
          <button class="btn primary" style="width:100%;justify-content:center" id="lg_btn">Entrar</button>
        </div>
      </div>
      <div class="login-foot">Desenvolvido por Rafael Almeida · rafael.almeida@accor.com</div>
    </div>`;
  const submit = () => doLogin();
  $('lg_btn').onclick = submit;
  $('lg_pass').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  $('lg_user').focus();
}
async function doLogin() {
  const username = val('lg_user'), password = $('lg_pass').value;
  if (!username || !password) { $('loginErr').innerHTML = `<div class="modal-err">Informe usuário e senha.</div>`; return; }
  try {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    setSession(r.token, r.user); State.hoteis = r.hoteis;
    if (r.user.mustChangePassword) return renderTrocaSenha();
    afterLogin();
  } catch (e) { $('loginErr').innerHTML = `<div class="modal-err">${esc(e.message)}</div>`; }
}
function renderTrocaSenha() {
  $('root').innerHTML = `
    <div class="gate"><div class="gate-tools">${themeBtn()}<button class="theme-btn" onclick="ajuda()" title="Dúvidas e suporte"><span>?</span></button></div><div class="login-card">
      <div class="login-head"><div class="mk">${svg(I.cog)}</div><h1>Definir nova senha</h1><p>Por segurança, troque a senha no primeiro acesso</p></div>
      <div class="login-body"><div id="tsErr"></div>
        <div class="field"><label>Nova senha</label><input id="ts_a" type="password" placeholder="mínimo 4 caracteres"></div>
        <div class="field"><label>Confirmar senha</label><input id="ts_b" type="password"></div>
        <button class="btn primary" style="width:100%;justify-content:center" id="ts_btn">Salvar e entrar</button>
      </div></div></div>`;
  $('ts_btn').onclick = async () => {
    const a = $('ts_a').value, b = $('ts_b').value;
    if (a.length < 4) return ($('tsErr').innerHTML = `<div class="modal-err">A senha deve ter ao menos 4 caracteres.</div>`);
    if (a !== b) return ($('tsErr').innerHTML = `<div class="modal-err">As senhas não conferem.</div>`);
    try { await api('/auth/change-password', { method: 'POST', body: { nova: a } }); toast('Senha atualizada.', 'ok'); afterLogin(); }
    catch (e) { $('tsErr').innerHTML = `<div class="modal-err">${esc(e.message)}</div>`; }
  };
}
function afterLogin() {
  if (State.hotel && State.hoteis.some((h) => h.id === State.hotel.id)) return enterApp();
  if (isAdmin() && State.hoteis.length === 0) { setHotel(null); State.page = 'hoteis'; return enterApp(); }
  if (State.hoteis.length === 1 && !isAdmin()) { setHotel(State.hoteis[0]); return enterApp(); }
  renderHotelSelect();
}
function logout() { clearSession(); renderLogin(); }

/* ============================================================
   SELEÇÃO DE HOTEL
   ============================================================ */
function renderHotelSelect() {
  setHotel(null);
  const tiles = State.hoteis.map((h) => `
    <button class="hotel-tile" onclick="selecionarHotel('${h.id}')">
      <div class="hcode">${esc(h.codigo || '')}</div><h3>${esc(h.nome)}</h3>
      <div class="hmeta">${esc(h.cidade || '')}</div></button>`).join('');
  $('root').innerHTML = `
    <div class="gate-hotels">
      <div class="hotel-top">${svg(I.hotel)}<div style="flex:1"><div style="font-weight:600">Selecionar hotel</div>
        <div style="font-size:12px;opacity:.85">${esc(State.user.nome)} · ${roleLabel(State.user.role)}</div></div>
        ${themeBtn()}<button class="theme-btn" onclick="ajuda()" title="Dúvidas e suporte"><span>?</span></button>
        <button class="btn sm" onclick="logout()" style="background:rgba(255,255,255,.15);color:#fff;border-color:transparent">Sair</button></div>
      <div class="hotel-wrap">
        <h2 style="margin-bottom:4px">Escolha o hotel</h2>
        <p class="t-sub" style="margin-bottom:18px">Cada hotel é um almoxarifado independente.</p>
        ${isAdmin() ? `<div class="row" style="margin-bottom:20px"><button class="btn primary" onclick="gateCriarHotel()">${svg(I.plus)} Criar hotel</button><button class="btn" onclick="gateAdmin('usuarios')">${svg(I.users)} Gerir usuários</button><button class="btn" onclick="gateAdmin('hoteis')">${svg(I.hotel)} Painel administrativo</button></div>` : ''}
        ${State.hoteis.length
          ? `<div class="hotel-grid">${tiles}</div>`
          : `<div class="empty"><h4>Nenhum hotel cadastrado</h4><p>${isAdmin() ? 'Crie o primeiro hotel para começar — use o botão "Criar hotel" acima. Você também pode gerir os usuários por aqui.' : 'Peça ao administrador para vincular seu usuário a um hotel.'}</p></div>`}
      </div></div>`;
}
function selecionarHotel(id) { const h = State.hoteis.find((x) => x.id === id); if (h) { setHotel(h); enterApp(); } }
function trocarHotel() { renderHotelSelect(); }
// Cria um hotel direto pela tela de entrada (sem precisar entrar no app).
function gateCriarHotel() {
  openModal('Novo hotel', `<div class="field-row c2"><div class="field"><label>Código</label><input id="h_cod" placeholder="Ex.: H001"></div><div class="field"><label>Cidade</label><input id="h_cid"></div></div><div class="field"><label>Nome <span class="req">*</span></label><input id="h_nome" placeholder="Nome do hotel"></div>`, async () => {
    const body = { codigo: val('h_cod'), nome: val('h_nome'), cidade: val('h_cid') };
    if (!body.nome) return modalErr('Informe o nome.');
    await api('/hoteis', { method: 'POST', body });
    const me = await api('/me'); State.hoteis = me.hoteis;
    closeModal(); toast('Hotel criado.', 'ok'); renderHotelSelect();
  }, 'wide', 'Criar hotel');
}
// Entra no modo administração (sem hotel selecionado) numa página específica.
function gateAdmin(page) { setHotel(null); State.page = page || 'hoteis'; enterApp(); }

/* ============================================================
   APP SHELL
   ============================================================ */
const PAGES = [
  { id: 'painel', grp: 'Operação', label: 'Painel', icon: I.dash },
  { id: 'itens', grp: 'Cadastros', label: 'Itens', icon: I.box, roles: ['admin', 'almoxarifado'] },
  { id: 'categorias', grp: 'Cadastros', label: 'Categorias', icon: I.tag, roles: ['admin', 'almoxarifado'] },
  { id: 'fornecedores', grp: 'Cadastros', label: 'Fornecedores', icon: I.truck, roles: ['admin', 'almoxarifado'] },
  { id: 'entradas', grp: 'Movimentação', label: 'Entradas', icon: I.in, roles: ['admin', 'almoxarifado'] },
  { id: 'requisicoes', grp: 'Movimentação', label: 'Requisições / Saídas', icon: I.out },
  { id: 'ajustes', grp: 'Movimentação', label: 'Ajustes', icon: I.adj, roles: ['admin', 'almoxarifado'] },
  { id: 'kardex', grp: 'Movimentação', label: 'Kardex', icon: I.ledger },
  { id: 'hoteis', grp: 'Administração', label: 'Hotéis', icon: I.hotel, admin: true },
  { id: 'usuarios', grp: 'Administração', label: 'Usuários', icon: I.users, admin: true },
];
function podeVer(p) {
  if (p.admin && !isAdmin()) return false;
  if (p.roles && !p.roles.includes(State.user.role)) return false;
  return true;
}
let pendentesCount = 0;
function enterApp() {
  if (!State.hotel && !isAdmin()) return renderHotelSelect();
  const semHotel = !State.hotel;
  const brandTxt = semHotel ? 'Modo administração' : esc(State.hotel.nome);
  const footTxt = semHotel
    ? `Nenhum hotel selecionado · <a onclick="trocarHotel()" style="cursor:pointer">Selecionar hotel</a>`
    : `${esc(State.hotel.nome)} ${State.hoteis.length > 1 || isAdmin() ? `· <a onclick="trocarHotel()" style="cursor:pointer">Trocar hotel</a>` : ''}`;
  $('root').innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><div class="mk">AX</div><div><h1>Almoxarifado</h1><p id="brandHotel">${brandTxt}</p></div></div>
        <nav class="nav" id="nav"></nav>
      </aside>
      <header class="topbar">
        <button class="btn sm" id="menuBtn" style="display:none" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
        <div><div class="crumb" id="crumb">Operação</div><h2 id="pageTitle">Painel</h2></div>
        <div class="spacer"></div>
        ${themeBtn()}
        <button class="help-btn" title="Ajuda / suporte" onclick="ajuda()">?</button>
        <div class="user-chip"><div class="avatar">${initials(State.user.nome)}</div>
          <div><div class="uname">${esc(State.user.nome)}</div><div class="urole">${roleLabel(State.user.role)}</div></div>
          <button class="icon-btn" title="Sair" onclick="logout()">${svg(I.swap)}</button></div>
      </header>
      <main class="content" id="view"></main>
      <footer class="appfoot"><span>${svg(I.hotel, 'ic-sm')}</span> ${footTxt}
        <span class="spacer"></span> Desenvolvido por Rafael Almeida · rafael.almeida@accor.com</footer>
    </div>`;
  if (window.innerWidth <= 860) $('menuBtn').style.display = 'inline-flex';
  buildNav(); go(State.page || (semHotel ? 'hoteis' : 'painel'));
}
function buildNav() {
  const nav = $('nav'); let html = ''; let lastGrp = '';
  const semHotel = !State.hotel;
  PAGES.filter((p) => podeVer(p) && (!semHotel || p.admin)).forEach((p) => {
    if (p.grp !== lastGrp) { html += `<div class="group">${p.grp}</div>`; lastGrp = p.grp; }
    let badge = '';
    if (p.id === 'requisicoes' && canApprove() && pendentesCount > 0) badge = `<span class="badge warn">${pendentesCount}</span>`;
    html += `<a data-page="${p.id}" class="${p.id === State.page ? 'active' : ''}" onclick="go('${p.id}')">${svg(p.icon)}<span>${p.label}</span>${badge}</a>`;
  });
  if (semHotel) html += `<div class="group">Hotel</div><a onclick="trocarHotel()">${svg(I.hotel)}<span>Selecionar hotel</span></a>`;
  nav.innerHTML = html;
}
function go(pageId) {
  let p = PAGES.find((x) => x.id === pageId);
  if (!p || !podeVer(p)) pageId = State.hotel ? 'painel' : 'hoteis';
  // Sem hotel selecionado, só páginas administrativas podem abrir.
  if (!State.hotel) { const pp = PAGES.find((x) => x.id === pageId); if (!pp || !pp.admin) pageId = 'hoteis'; }
  State.page = pageId;
  const pg = PAGES.find((x) => x.id === pageId);
  $('pageTitle').textContent = pg.label; $('crumb').textContent = pg.grp;
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === pageId));
  if (window.innerWidth <= 860) $('sidebar').classList.remove('open');
  const v = $('view'); v.innerHTML = `<p class="t-sub">Carregando…</p>`;
  ({ painel: renderPainel, itens: renderItens, categorias: renderCategorias, fornecedores: renderFornecedores,
     entradas: renderEntradas, requisicoes: renderRequisicoes, ajustes: renderAjustes, kardex: renderKardex,
     hoteis: renderHoteis, usuarios: renderUsuarios }[pageId])(v);
}
function refresh() { go(State.page); }
function ajuda() {
  openInfo('Ajuda e suporte', `<p>Em caso de dúvidas ou problemas, fale com o responsável pelo sistema:</p>
    <p style="margin-top:10px"><strong>Rafael Almeida</strong><br>
    <a href="mailto:rafael.almeida@accor.com">rafael.almeida@accor.com</a><br>
    <a href="https://teams.microsoft.com/l/chat/0/0?users=rafael.almeida@accor.com" target="_blank">Abrir conversa no Teams</a></p>`);
}

/* ============================================================
   PÁGINAS
   ============================================================ */
const tbl = (cols) => `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>`;
const pillStatus = (s) => s === 'zero' ? '<span class="pill zero">Zerado</span>' : s === 'low' ? '<span class="pill low">Baixo</span>' : '<span class="pill ok">Normal</span>';
const statusItem = (i) => i.estoqueAtual <= 0 ? 'zero' : i.estoqueAtual <= i.estoqueMinimo ? 'low' : 'ok';
const pillTipo = (t) => t === 'entrada' ? '<span class="pill in">Entrada</span>' : t === 'saida' ? '<span class="pill out">Saída</span>' : '<span class="pill adj">Ajuste</span>';
const pillReq = (s) => s === 'pendente' ? `<span class="pill pend">${svg(I.clock, 'ic-sm')} Pendente</span>` : s === 'aprovada' ? `<span class="pill aprov">${svg(I.approve, 'ic-sm')} Aprovada</span>` : s === 'rejeitada' ? `<span class="pill rej">${svg(I.reject, 'ic-sm')} Rejeitada</span>` : '<span class="pill muted">—</span>';

// ----- Painel -----
async function renderPainel(v) {
  const d = await getH('/dashboard');
  pendentesCount = d.requisicoesPendentes; buildNav();
  let html = `<div class="kpis">
    <div class="kpi"><span class="accent"></span><div class="label">Itens cadastrados</div><div class="val">${d.totalItens}</div><div class="foot">${d.ativos} ativos</div></div>
    <div class="kpi money"><span class="accent"></span><div class="label">Valor em estoque</div><div class="val" style="font-size:21px">${fmtMoney(d.valorEstoque)}</div><div class="foot">custo médio</div></div>
    <div class="kpi warn"><span class="accent"></span><div class="label">Estoque baixo</div><div class="val">${d.estoqueBaixo}</div><div class="foot">no/abaixo do mínimo</div></div>
    <div class="kpi ${d.requisicoesPendentes ? 'out' : ''}"><span class="accent"></span><div class="label">Requisições pendentes</div><div class="val">${d.requisicoesPendentes}</div><div class="foot">${canApprove() ? 'aguardando aprovação' : 'em análise'}</div></div>
  </div>`;
  if (canApprove() && d.requisicoesPendentes > 0) {
    const pend = (await getH('/requisicoes')).filter((r) => r.status === 'pendente').slice(0, 6);
    html += `<div class="card" style="margin-bottom:18px;border-color:var(--warn)"><div class="card-head">${svg(I.clock)}<h3>Requisições aguardando aprovação</h3><div class="spacer"></div><button class="btn sm" onclick="go('requisicoes')">Ver todas</button></div>`;
    html += tbl([{ t: 'Nº' }, { t: 'Data' }, { t: 'Solicitante' }, { t: 'Setor' }, { t: 'Itens', r: 1 }, { t: '', r: 1 }]);
    pend.forEach((r) => { html += `<tr><td class="t-code">${r.numero}</td><td class="t-sub mono">${fmtDate(r.data)}</td><td class="t-desc">${esc(r.requisitante)}</td><td class="t-sub">${esc(r.setor || '—')}</td><td class="num">${r.qtdItens}</td>
      <td class="actions-cell"><button class="icon-btn" title="Ver" onclick="verRequisicao('${r.id}')">${svg(I.eye)}</button><button class="icon-btn" style="color:var(--in)" title="Aprovar" onclick="aprovarRequisicao('${r.id}')">${svg(I.approve)}</button><button class="icon-btn danger" title="Rejeitar" onclick="rejeitarRequisicao('${r.id}')">${svg(I.reject)}</button></td></tr>`; });
    html += `</tbody></table></div>`;
  }
  html += `<div class="grid-2"><div class="card"><div class="card-head">${svg(I.alert)}<h3>Alertas de reposição</h3><div class="spacer"></div><button class="btn sm" onclick="go('itens')">Ver itens</button></div>`;
  if (!d.alertas.length) html += `<div class="empty" style="padding:30px">${svg(I.check)}<h4>Tudo em ordem</h4><p>Nenhum item no ponto de reposição.</p></div>`;
  else { html += tbl([{ t: 'Item' }, { t: 'Atual', r: 1 }, { t: 'Mínimo', r: 1 }, { t: 'Status', r: 1 }]);
    d.alertas.forEach((i) => { html += `<tr><td><div class="t-desc">${esc(i.descricao)}</div><div class="t-code">${esc(i.codigo)}</div></td><td class="num">${fmtNum(i.estoqueAtual)} ${i.unidade}</td><td class="num">${fmtNum(i.estoqueMinimo)}</td><td class="num">${pillStatus(statusItem(i))}</td></tr>`; });
    html += `</tbody></table></div>`; }
  html += `</div><div class="card"><div class="card-head">${svg(I.ledger)}<h3>Movimentações recentes</h3><div class="spacer"></div><button class="btn sm" onclick="go('kardex')">Kardex</button></div>`;
  if (!d.recentes.length) html += `<div class="empty" style="padding:30px"><h4>Sem movimentações</h4><p>Registre uma entrada ou requisição.</p></div>`;
  else { html += tbl([{ t: 'Data' }, { t: 'Item' }, { t: 'Tipo' }, { t: 'Qtd', r: 1 }]);
    d.recentes.forEach((m) => { html += `<tr><td class="t-sub mono">${fmtDate(m.data)}</td><td class="t-desc" style="font-size:13px">${esc(m.descricao)}</td><td>${pillTipo(m.tipo)}</td><td class="num ${m.tipo === 'entrada' ? 'mv-in' : m.tipo === 'saida' ? 'mv-out' : 'mv-adj'}">${m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : ''}${fmtNum(m.quantidade)}</td></tr>`; });
    html += `</tbody></table></div>`; }
  html += `</div><div class="section-title">Ações rápidas</div><div class="row">
    ${canStock() ? `<button class="btn primary" onclick="modalEntrada()">${svg(I.in)} Nova entrada</button>` : ''}
    <button class="btn ${canStock() ? '' : 'primary'}" onclick="modalRequisicao()">${svg(I.out)} Nova requisição</button>
    ${canStock() ? `<button class="btn" onclick="modalItem()">${svg(I.plus)} Novo item</button>` : ''}</div>`;
  v.innerHTML = html;
}

// ----- Itens -----
let itensCache = [];
async function renderItens(v) {
  itensCache = await getH('/itens');
  let html = `<div class="toolbar"><div class="search">${svg(I.search)}<input id="fq" placeholder="Buscar por código ou descrição…" oninput="filtraItens()"></div><div class="spacer"></div><button class="btn primary" onclick="modalItem()">${svg(I.plus)} Novo item</button></div><div id="itensBox"></div>`;
  v.innerHTML = html; filtraItens();
}
function filtraItens() {
  const q = (val('fq') || '').toLowerCase();
  const lista = itensCache.filter((i) => !q || (i.descricao + ' ' + i.codigo).toLowerCase().includes(q));
  let html;
  if (!itensCache.length) html = `<div class="card"><div class="empty">${svg(I.box)}<h4>Nenhum item cadastrado</h4><p>Cadastre os materiais do almoxarifado.</p><button class="btn primary" onclick="modalItem()">${svg(I.plus)} Cadastrar item</button></div></div>`;
  else { html = tbl([{ t: 'Código' }, { t: 'Descrição' }, { t: 'Un.' }, { t: 'Estoque', r: 1 }, { t: 'Mínimo', r: 1 }, { t: 'Custo méd.', r: 1 }, { t: 'Status', r: 1 }, { t: '', r: 1 }]);
    lista.forEach((i) => { html += `<tr><td class="t-code">${esc(i.codigo)}</td><td><div class="t-desc">${esc(i.descricao)}</div>${i.ativo === false ? '<span class="pill muted">inativo</span>' : ''}</td><td>${esc(i.unidade)}</td><td class="num">${fmtNum(i.estoqueAtual)}</td><td class="num">${fmtNum(i.estoqueMinimo)}</td><td class="num">${fmtMoney(i.custoMedio)}</td><td class="num">${pillStatus(statusItem(i))}</td>
      <td class="actions-cell"><button class="icon-btn" title="Editar" onclick="modalItem('${i.id}')">${svg(I.edit)}</button><button class="icon-btn danger" title="Excluir" onclick="excluirItem('${i.id}')">${svg(I.trash)}</button></td></tr>`; });
    html += `</tbody></table></div>`; }
  $('itensBox').innerHTML = html;
}
const UNIDADES = ['UN', 'CX', 'PCT', 'KG', 'G', 'L', 'ML', 'M', 'M²', 'M³', 'PAR', 'DZ', 'RL', 'FD', 'GL', 'LATA', 'SC', 'FR', 'KIT'];
async function modalItem(id) {
  const it = id ? itensCache.find((x) => x.id === id) : null;
  const cats = await getH('/categorias');
  openModal(it ? 'Editar item' : 'Novo item', `
    <div class="field-row c2"><div class="field"><label>Código <span class="req">*</span></label><input id="m_cod" value="${esc(it ? it.codigo : '')}" ${it ? 'disabled' : ''}></div>
      <div class="field"><label>Unidade</label><select id="m_un">${UNIDADES.map((u) => `<option ${it && it.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <div class="field"><label>Descrição <span class="req">*</span></label><input id="m_desc" value="${esc(it ? it.descricao : '')}"></div>
    <div class="field-row c2"><div class="field"><label>Categoria</label><select id="m_cat"><option value="">—</option>${cats.map((c) => `<option value="${c.id}" ${it && it.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Localização</label><input id="m_loc" value="${esc(it ? it.localizacao : '')}"></div></div>
    <div class="field-row c2"><div class="field"><label>${it ? 'Estoque atual' : 'Estoque inicial'}</label><input id="m_est" type="number" step="any" value="${it ? it.estoqueAtual : 0}" ${it ? 'disabled' : ''}></div>
      <div class="field"><label>Estoque mínimo</label><input id="m_min" type="number" step="any" value="${it ? it.estoqueMinimo : 0}"></div></div>
    ${it ? '' : `<div class="field"><label>Custo unitário inicial</label><input id="m_custo" type="number" step="any" value="0"></div>`}
    ${it ? `<div class="field"><label>Situação</label><select id="m_ativo"><option value="1" ${it.ativo !== false ? 'selected' : ''}>Ativo</option><option value="0" ${it.ativo === false ? 'selected' : ''}>Inativo</option></select></div>` : ''}
  `, async () => {
    const body = { codigo: val('m_cod'), descricao: val('m_desc'), unidade: val('m_un'), categoriaId: val('m_cat') || null, localizacao: val('m_loc'), estoqueMinimo: $('m_min').value };
    if (!it) { body.estoqueAtual = $('m_est').value; body.custoMedio = $('m_custo').value; await postH('/itens', body); toast('Item cadastrado.', 'ok'); }
    else { body.ativo = val('m_ativo') === '1'; await putH('/itens/' + id, body); toast('Item atualizado.', 'ok'); }
    closeModal(); refresh();
  }, 'wide', it ? 'Salvar' : 'Cadastrar');
}
function excluirItem(id) { const it = itensCache.find((x) => x.id === id); confirmar('Excluir item?', `Excluir "${it.descricao}"? Itens com movimentação devem ser inativados.`, async () => { await delH('/itens/' + id); closeModal(); toast('Item excluído.', 'warn'); refresh(); }, 'Excluir'); }

// ----- Categorias / Fornecedores (cadastros simples) -----
let catCache = [];
async function renderCategorias(v) {
  catCache = await getH('/categorias');
  let html = `<div class="toolbar"><div class="spacer"></div><button class="btn primary" onclick="modalCategoria()">${svg(I.plus)} Nova categoria</button></div>`;
  if (!catCache.length) html += `<div class="card"><div class="empty">${svg(I.tag)}<h4>Nenhuma categoria</h4></div></div>`;
  else { html += tbl([{ t: 'Categoria' }, { t: '', r: 1 }]); catCache.forEach((c) => { html += `<tr><td class="t-desc">${esc(c.nome)}</td><td class="actions-cell"><button class="icon-btn" onclick="modalCategoria('${c.id}')">${svg(I.edit)}</button><button class="icon-btn danger" onclick="excluirCategoria('${c.id}')">${svg(I.trash)}</button></td></tr>`; }); html += `</tbody></table></div>`; }
  v.innerHTML = html;
}
function modalCategoria(id) { const c = id ? (catCache.find((x) => x.id === id) || {}) : {}; openModal(c.id ? 'Editar categoria' : 'Nova categoria', `<div class="field"><label>Nome <span class="req">*</span></label><input id="m_nome" value="${esc(c.nome || '')}"></div>`, async () => { const n = val('m_nome'); if (!n) return modalErr('Informe o nome.'); if (c.id) await putH('/categorias/' + c.id, { nome: n }); else await postH('/categorias', { nome: n }); closeModal(); toast('Salvo.', 'ok'); refresh(); }); }
function excluirCategoria(id) { confirmar('Excluir categoria?', 'Os itens dessa categoria ficarão sem categoria.', async () => { await delH('/categorias/' + id); closeModal(); toast('Excluída.', 'warn'); refresh(); }, 'Excluir'); }

let fornCache = [];
async function renderFornecedores(v) {
  fornCache = await getH('/fornecedores');
  let html = `<div class="toolbar"><div class="spacer"></div><button class="btn primary" onclick="modalFornecedor()">${svg(I.plus)} Novo fornecedor</button></div>`;
  if (!fornCache.length) html += `<div class="card"><div class="empty">${svg(I.truck)}<h4>Nenhum fornecedor</h4></div></div>`;
  else { html += tbl([{ t: 'Nome' }, { t: 'CNPJ' }, { t: 'Contato' }, { t: 'Telefone' }, { t: '', r: 1 }]); fornCache.forEach((f) => { html += `<tr><td class="t-desc">${esc(f.nome)}</td><td class="t-sub">${esc(f.cnpj || '—')}</td><td class="t-sub">${esc(f.contato || '—')}</td><td class="t-sub">${esc(f.telefone || '—')}</td><td class="actions-cell"><button class="icon-btn" onclick="modalFornecedor('${f.id}')">${svg(I.edit)}</button><button class="icon-btn danger" onclick="excluirFornecedor('${f.id}')">${svg(I.trash)}</button></td></tr>`; }); html += `</tbody></table></div>`; }
  v.innerHTML = html;
}
function modalFornecedor(id) { const f = id ? (fornCache.find((x) => x.id === id) || {}) : {}; openModal(f.id ? 'Editar fornecedor' : 'Novo fornecedor', `<div class="field"><label>Nome <span class="req">*</span></label><input id="f_nome" value="${esc(f.nome || '')}"></div><div class="field-row c2"><div class="field"><label>CNPJ</label><input id="f_cnpj" value="${esc(f.cnpj || '')}"></div><div class="field"><label>Telefone</label><input id="f_tel" value="${esc(f.telefone || '')}"></div></div><div class="field-row c2"><div class="field"><label>Contato</label><input id="f_cont" value="${esc(f.contato || '')}"></div><div class="field"><label>E-mail</label><input id="f_mail" value="${esc(f.email || '')}"></div></div>`, async () => { const body = { nome: val('f_nome'), cnpj: val('f_cnpj'), telefone: val('f_tel'), contato: val('f_cont'), email: val('f_mail') }; if (!body.nome) return modalErr('Informe o nome.'); if (f.id) await putH('/fornecedores/' + f.id, body); else await postH('/fornecedores', body); closeModal(); toast('Salvo.', 'ok'); refresh(); }, 'wide'); }
function excluirFornecedor(id) { confirmar('Excluir fornecedor?', 'Ação não pode ser desfeita.', async () => { await delH('/fornecedores/' + id); closeModal(); toast('Excluído.', 'warn'); refresh(); }, 'Excluir'); }

// ----- Linhas de itens (entradas/requisições) -----
let linhas = [];
function linhasHtml(tipo) {
  return linhas.map((l, idx) => `<div class="li-row" style="grid-template-columns:1fr 120px ${tipo === 'entrada' ? '130px' : '120px'} 36px">
    <select onchange="linhas[${idx}].itemId=this.value">${itensCache.filter((i) => i.ativo !== false).map((i) => `<option value="${i.id}" ${l.itemId === i.id ? 'selected' : ''}>${esc(i.codigo)} — ${esc(i.descricao)}</option>`).join('')}</select>
    <input type="number" step="any" min="0" placeholder="Qtd" value="${l.quantidade || ''}" oninput="linhas[${idx}].quantidade=parseFloat(this.value)||0">
    ${tipo === 'entrada' ? `<input type="number" step="any" min="0" placeholder="Custo unit." value="${l.custoUnitario || ''}" oninput="linhas[${idx}].custoUnitario=parseFloat(this.value)||0">` : `<span class="t-sub" style="font-family:var(--mono);align-self:center">${(() => { const it = itensCache.find((i) => i.id === l.itemId); return it ? fmtNum(it.estoqueAtual) + ' ' + it.unidade : ''; })()}</span>`}
    <button class="icon-btn danger" onclick="linhas.splice(${idx},1);redrawLinhas('${tipo}')">${svg(I.x)}</button></div>`).join('');
}
function redrawLinhas(tipo) { $('linhas').innerHTML = linhasHtml(tipo); }
function addLinha(tipo) { const first = itensCache.find((i) => i.ativo !== false); linhas.push({ itemId: first ? first.id : null, quantidade: 0, custoUnitario: 0 }); redrawLinhas(tipo); }

// ----- Entradas -----
async function renderEntradas(v) {
  const es = await getH('/entradas');
  let html = `<div class="toolbar"><div class="spacer"></div><button class="btn primary" onclick="modalEntrada()">${svg(I.in)} Nova entrada</button></div>`;
  if (!es.length) html += `<div class="card"><div class="empty">${svg(I.in)}<h4>Nenhuma entrada</h4><p>Registre o recebimento de materiais.</p></div></div>`;
  else { html += tbl([{ t: 'Nº' }, { t: 'Data' }, { t: 'Fornecedor' }, { t: 'NF' }, { t: 'Itens', r: 1 }]); es.forEach((e) => { html += `<tr><td class="t-code">${e.numero}</td><td class="t-sub mono">${fmtDate(e.data)}</td><td class="t-desc">${esc(e.fornecedorNome || '—')}</td><td class="t-sub">${esc(e.notaFiscal || '—')}</td><td class="num">${e.qtdItens}</td></tr>`; }); html += `</tbody></table></div>`; }
  v.innerHTML = html;
}
async function modalEntrada() {
  itensCache = await getH('/itens'); const fs = await getH('/fornecedores');
  if (!itensCache.length) return toast('Cadastre itens antes de registrar entradas.', 'warn');
  linhas = [];
  openModal('Nova entrada', `<div class="field-row c2"><div class="field"><label>Fornecedor</label><select id="e_forn"><option value="">—</option>${fs.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div><div class="field"><label>Nota fiscal</label><input id="e_nf"></div></div>
    <div class="field-row c2"><div class="field"><label>Data</label><input id="e_data" type="date" value="${todayInput()}"></div><div></div></div>
    <label class="section-title" style="margin-top:4px">Itens recebidos</label>
    <div class="li-head" style="grid-template-columns:1fr 120px 130px 36px"><div>Item</div><div>Quantidade</div><div>Custo unit.</div><div></div></div>
    <div id="linhas"></div><button class="btn sm" style="margin-top:6px" onclick="addLinha('entrada')">${svg(I.plus)} Adicionar item</button>
    <div class="field" style="margin-top:14px"><label>Observação</label><textarea id="e_obs" rows="2"></textarea></div>`, async () => {
    const itens = linhas.filter((l) => l.itemId && l.quantidade > 0);
    if (!itens.length) return modalErr('Adicione ao menos um item com quantidade.');
    await postH('/entradas', { fornecedorId: val('e_forn') || null, notaFiscal: val('e_nf'), data: val('e_data') || null, obs: val('e_obs'), itens });
    closeModal(); toast('Entrada registrada — estoque atualizado.', 'ok'); refresh();
  }, 'wide', 'Registrar entrada');
  addLinha('entrada');
}

// ----- Requisições (com aprovação) -----
async function renderRequisicoes(v) {
  const rs = await getH('/requisicoes');
  pendentesCount = rs.filter((r) => r.status === 'pendente').length; buildNav();
  let html = `<div class="toolbar"><div class="spacer"></div><button class="btn primary" onclick="modalRequisicao()">${svg(I.out)} Nova requisição</button></div>`;
  if (canApprove() && pendentesCount) html += `<div class="card" style="margin-bottom:16px;border-color:var(--warn)"><div class="card-body" style="display:flex;gap:10px;align-items:center">${svg(I.clock)}<span class="t-sub">Há <strong>${pendentesCount}</strong> requisição(ões) aguardando aprovação. O estoque só é abatido após aprovar (informando a quantidade real que saiu).</span></div></div>`;
  if (!rs.length) html += `<div class="card"><div class="empty">${svg(I.out)}<h4>Nenhuma requisição</h4><p>Atendentes criam requisições; o almoxarifado aprova e o estoque é abatido.</p></div></div>`;
  else { html += tbl([{ t: 'Nº' }, { t: 'Data' }, { t: 'Status' }, { t: 'Solicitante' }, { t: 'Setor' }, { t: 'Itens', r: 1 }, { t: 'Valor', r: 1 }, { t: '', r: 1 }]);
    rs.forEach((r) => { let ac = `<button class="icon-btn" title="Ver" onclick="verRequisicao('${r.id}')">${svg(I.eye)}</button>`;
      if (r.status === 'pendente' && canApprove()) ac += `<button class="icon-btn" style="color:var(--in)" title="Aprovar" onclick="aprovarRequisicao('${r.id}')">${svg(I.approve)}</button><button class="icon-btn danger" title="Rejeitar" onclick="rejeitarRequisicao('${r.id}')">${svg(I.reject)}</button>`;
      html += `<tr><td class="t-code">${r.numero}</td><td class="t-sub mono">${fmtDate(r.data)}</td><td>${pillReq(r.status)}</td><td class="t-desc">${esc(r.requisitante)}</td><td class="t-sub">${esc(r.setor || '—')}</td><td class="num">${r.qtdItens}</td><td class="num">${fmtMoney(r.valor)}</td><td class="actions-cell">${ac}</td></tr>`; });
    html += `</tbody></table></div>`; }
  v.innerHTML = html;
}
async function modalRequisicao() {
  itensCache = await getH('/itens');
  if (!itensCache.filter((i) => i.ativo !== false).length) return toast('Cadastre itens antes de criar requisições.', 'warn');
  linhas = [];
  openModal('Nova requisição de saída', `<div class="field-row c2"><div class="field"><label>Solicitante <span class="req">*</span></label><input id="r_req" value="${esc(State.user.nome)}"></div><div class="field"><label>Setor / Centro de custo</label><input id="r_setor"></div></div>
    <div class="field-row c2"><div class="field"><label>Data</label><input id="r_data" type="date" value="${todayInput()}"></div><div></div></div>
    <label class="section-title" style="margin-top:4px">Itens requisitados</label>
    <div class="li-head" style="grid-template-columns:1fr 120px 120px 36px"><div>Item</div><div>Quantidade</div><div>Em estoque</div><div></div></div>
    <div id="linhas"></div><button class="btn sm" style="margin-top:6px" onclick="addLinha('saida')">${svg(I.plus)} Adicionar item</button>
    <div class="field" style="margin-top:14px"><label>Observação</label><textarea id="r_obs" rows="2"></textarea></div>
    <p class="t-sub" style="margin-top:8px">A requisição entra como <strong>pendente</strong>. O estoque só será abatido na aprovação.</p>`, async () => {
    const req = val('r_req'); if (!req) return modalErr('Informe o solicitante.');
    const itens = linhas.filter((l) => l.itemId && l.quantidade > 0);
    if (!itens.length) return modalErr('Adicione ao menos um item com quantidade.');
    await postH('/requisicoes', { requisitante: req, setor: val('r_setor'), data: val('r_data') || null, obs: val('r_obs'), itens });
    closeModal(); toast('Requisição criada — aguardando aprovação.', 'ok'); refresh();
  }, 'wide', 'Enviar para aprovação');
  addLinha('saida');
}
async function verRequisicao(id) {
  const r = await getH('/requisicoes/' + id);
  const aprovada = r.status === 'aprovada';
  let rows = r.itens.map((l) => { const qReq = l.quantidade, qReal = l.quantidadeReal; const div = aprovada && qReal != null && qReal !== qReq; const base = aprovada ? (qReal != null ? qReal : qReq) : qReq;
    return `<tr><td>${esc(l.descricao)}</td><td class="num ${div ? 'diverg neg' : ''}">${fmtNum(base)} ${l.unidade}${div ? ` <span class="t-sub">(solic. ${fmtNum(qReq)})</span>` : ''}</td><td class="num">${fmtMoney(l.custoUnitario)}</td><td class="num">${fmtMoney(base * (l.custoUnitario || 0))}</td></tr>`; }).join('');
  const tot = r.itens.reduce((s, l) => s + (aprovada ? (l.quantidadeReal != null ? l.quantidadeReal : l.quantidade) : l.quantidade) * (l.custoUnitario || 0), 0);
  const aprovBtn = (r.status === 'pendente' && canApprove()) ? `<button class="btn primary" onclick="closeModal();aprovarRequisicao('${r.id}')">${svg(I.approve)} Aprovar</button><button class="btn" onclick="closeModal();rejeitarRequisicao('${r.id}')">${svg(I.reject)} Rejeitar</button>` : '';
  openInfo('Requisição ' + r.numero, `<div class="row" style="margin-bottom:14px">${aprovBtn}<button class="btn ${aprovBtn ? '' : 'primary'}" onclick="window.print()">${svg(I.print)} Imprimir</button></div>
    <div class="detail-list"><div class="dl-row"><span class="dl-k">Status</span><span class="dl-v">${pillReq(r.status)}</span></div>
      <div class="dl-row"><span class="dl-k">Data</span><span class="dl-v">${fmtDateTime(r.data)}</span></div>
      <div class="dl-row"><span class="dl-k">Solicitante</span><span class="dl-v">${esc(r.requisitante)}</span></div>
      <div class="dl-row"><span class="dl-k">Setor</span><span class="dl-v">${esc(r.setor || '—')}</span></div>
      ${r.aprovadoPor ? `<div class="dl-row"><span class="dl-k">${r.status === 'rejeitada' ? 'Rejeitada por' : 'Aprovada por'}</span><span class="dl-v">${esc(r.aprovadoPor)} · ${fmtDateTime(r.aprovadoEm)}</span></div>` : ''}</div>
    ${tbl([{ t: 'Item' }, { t: 'Qtd', r: 1 }, { t: 'Custo méd.', r: 1 }, { t: 'Total', r: 1 }])}${rows}<tr><td colspan="3" style="text-align:right;font-weight:600">Total</td><td class="num" style="font-weight:600">${fmtMoney(tot)}</td></tr></tbody></table></div>
    ${r.obs ? `<p class="t-sub" style="margin-top:12px">${esc(r.obs)}</p>` : ''}`);
}
async function aprovarRequisicao(id) {
  const r = await getH('/requisicoes/' + id);
  if (r.status !== 'pendente') return toast('Requisição não está pendente.', 'warn');
  itensCache = await getH('/itens');
  let rows = r.itens.map((l) => { const it = itensCache.find((i) => i.id === l.itemId); const disp = it ? it.estoqueAtual : 0;
    return `<tr><td class="t-desc">${esc(l.descricao)}</td><td class="num">${fmtNum(l.quantidade)} ${l.unidade}</td><td class="num ${disp < l.quantidade ? 'diverg neg' : ''}">${fmtNum(disp)}</td>
      <td><input class="qreal" data-id="${l.linhaId}" type="number" step="any" min="0" value="${l.quantidade}" style="width:100px;padding:6px 8px;border:1px solid var(--line-strong);border-radius:6px;text-align:right;font-family:var(--mono)"></td></tr>`; }).join('');
  openModal('Aprovar ' + r.numero, `<p class="t-sub" style="margin-bottom:12px">Informe a <strong>quantidade real</strong> que saiu de cada item. Divergências em relação ao solicitado ficam registradas.</p>
    ${tbl([{ t: 'Item' }, { t: 'Solicitado', r: 1 }, { t: 'Em estoque', r: 1 }, { t: 'Qtd. real' }])}${rows}</tbody></table></div>
    <div class="field" style="margin-top:12px"><label>Observação</label><input id="ap_obs"></div>`, async () => {
    const reais = {}; document.querySelectorAll('.qreal').forEach((ip) => { reais[ip.dataset.id] = parseFloat(ip.value) || 0; });
    await postH(`/requisicoes/${id}/aprovar`, { reais, obs: val('ap_obs') });
    closeModal(); toast('Requisição aprovada — estoque abatido.', 'ok'); refresh();
  }, 'wide', 'Aprovar e abater estoque');
}
function rejeitarRequisicao(id) {
  openModal('Rejeitar requisição', `<p class="t-sub" style="margin-bottom:12px">Nenhum estoque será movimentado.</p><div class="field"><label>Motivo</label><textarea id="rj_motivo" rows="2"></textarea></div>`, async () => {
    await postH(`/requisicoes/${id}/rejeitar`, { motivo: val('rj_motivo') }); closeModal(); toast('Requisição rejeitada.', 'warn'); refresh();
  }, null, 'Rejeitar');
}

// ----- Ajustes -----
async function renderAjustes(v) {
  itensCache = await getH('/itens');
  v.innerHTML = `<div class="card" style="max-width:560px"><div class="card-head">${svg(I.adj)}<h3>Ajuste de inventário</h3></div><div class="card-body">
    <p class="t-sub" style="margin-bottom:14px">Corrige o saldo de um item para o valor real contado. Gera um movimento de ajuste no Kardex.</p>
    <div class="field"><label>Item</label><select id="aj_item" onchange="ajSaldoAtual()">${itensCache.map((i) => `<option value="${i.id}">${esc(i.codigo)} — ${esc(i.descricao)}</option>`).join('')}</select></div>
    <div class="field"><label>Saldo no sistema</label><input id="aj_atual" disabled></div>
    <div class="field"><label>Novo saldo (real)</label><input id="aj_novo" type="number" step="any" min="0"></div>
    <div class="field"><label>Observação</label><input id="aj_obs"></div>
    <button class="btn primary" onclick="salvarAjuste()">${svg(I.check)} Registrar ajuste</button></div></div>`;
  ajSaldoAtual();
}
function ajSaldoAtual() { const it = itensCache.find((i) => i.id === val('aj_item')); if (it && $('aj_atual')) { $('aj_atual').value = fmtNum(it.estoqueAtual) + ' ' + it.unidade; if ($('aj_novo')) $('aj_novo').value = it.estoqueAtual; } }
async function salvarAjuste() { const itemId = val('aj_item'); if (!itemId) return toast('Selecione o item.', 'warn'); try { await postH('/ajustes', { itemId, novoSaldo: $('aj_novo').value, obs: val('aj_obs') }); toast('Ajuste registrado.', 'ok'); refresh(); } catch (e) { toast(e.message, 'err'); } }

// ----- Kardex -----
async function renderKardex(v) {
  const ms = await getH('/movimentacoes');
  let html = `<div class="card"><div class="card-head">${svg(I.ledger)}<h3>Kardex — movimentações</h3></div>`;
  if (!ms.length) html += `<div class="empty">${svg(I.ledger)}<h4>Sem movimentações</h4></div>`;
  else { html += tbl([{ t: 'Data' }, { t: 'Item' }, { t: 'Tipo' }, { t: 'Qtd', r: 1 }, { t: 'Custo unit.', r: 1 }, { t: 'Saldo', r: 1 }, { t: 'Documento' }]);
    ms.forEach((m) => { html += `<tr><td class="t-sub mono">${fmtDateTime(m.data)}</td><td><div class="t-desc" style="font-size:13px">${esc(m.itemDescricao)}</div><div class="t-code">${esc(m.itemCodigo)}</div></td><td>${pillTipo(m.tipo)}</td><td class="num ${m.tipo === 'entrada' ? 'mv-in' : m.tipo === 'saida' ? 'mv-out' : 'mv-adj'}">${m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : ''}${fmtNum(m.quantidade)}</td><td class="num">${fmtMoney(m.custoUnitario)}</td><td class="num">${fmtNum(m.saldoApos)}</td><td class="t-code">${esc(m.documento || '—')}</td></tr>`; });
    html += `</tbody></table>`; }
  v.innerHTML = html + `</div>`;
}

// ----- Hotéis (admin) -----
let hoteisAdminCache = [];
async function renderHoteis(v) {
  hoteisAdminCache = await api('/hoteis');
  let html = `<div class="toolbar"><div class="spacer"></div><button class="btn primary" onclick="modalHotel()">${svg(I.plus)} Novo hotel</button></div>`;
  html += tbl([{ t: 'Código' }, { t: 'Nome' }, { t: 'Cidade' }, { t: 'Itens', r: 1 }, { t: 'Valor estoque', r: 1 }, { t: 'Situação' }, { t: '', r: 1 }]);
  hoteisAdminCache.forEach((hh) => { html += `<tr><td class="t-code">${esc(hh.codigo || '—')}</td><td class="t-desc">${esc(hh.nome)}</td><td class="t-sub">${esc(hh.cidade || '—')}</td><td class="num">${hh.qtdItens}</td><td class="num">${fmtMoney(hh.valorEstoque)}</td><td>${hh.ativo === false ? '<span class="pill zero">Inativo</span>' : '<span class="pill ok">Ativo</span>'}</td>
    <td class="actions-cell"><button class="icon-btn" title="Criar usuário para este hotel" onclick="modalUsuario(null,'${hh.id}')">${svg(I.users)}</button><button class="icon-btn" title="Editar" onclick="modalHotel('${hh.id}')">${svg(I.edit)}</button><button class="icon-btn danger" title="Excluir" onclick="excluirHotel('${hh.id}')">${svg(I.trash)}</button></td></tr>`; });
  v.innerHTML = html + `</tbody></table></div>`;
}
function modalHotel(id) { const hh = id ? (hoteisAdminCache.find((x) => x.id === id) || {}) : {}; openModal(hh.id ? 'Editar hotel' : 'Novo hotel', `<div class="field-row c2"><div class="field"><label>Código</label><input id="h_cod" value="${esc(hh.codigo || '')}"></div><div class="field"><label>Cidade</label><input id="h_cid" value="${esc(hh.cidade || '')}"></div></div><div class="field"><label>Nome <span class="req">*</span></label><input id="h_nome" value="${esc(hh.nome || '')}"></div>${hh.id ? `<div class="field"><label>Situação</label><select id="h_ativo"><option value="1" ${hh.ativo !== false ? 'selected' : ''}>Ativo</option><option value="0" ${hh.ativo === false ? 'selected' : ''}>Inativo</option></select></div>` : ''}`, async () => { const body = { codigo: val('h_cod'), nome: val('h_nome'), cidade: val('h_cid') }; if (!body.nome) return modalErr('Informe o nome.'); if (hh.id) { body.ativo = val('h_ativo') === '1'; await api('/hoteis/' + hh.id, { method: 'PUT', body }); } else await api('/hoteis', { method: 'POST', body }); closeModal(); toast('Salvo.', 'ok'); const me = await api('/me'); State.hoteis = me.hoteis; refresh(); }, 'wide'); }
function excluirHotel(id) { const hh = hoteisAdminCache.find((x) => x.id === id) || {}; confirmar('Excluir hotel?', `Excluir "${hh.nome || ''}" e TODOS os seus dados (itens, movimentações, requisições)? Esta ação é irreversível.`, async () => { await api('/hoteis/' + id, { method: 'DELETE' }); closeModal(); toast('Hotel excluído.', 'warn'); const me = await api('/me'); State.hoteis = me.hoteis; if (State.hotel && State.hotel.id === id) { setHotel(null); return renderHotelSelect(); } refresh(); }, 'Excluir'); }

// ----- Usuários (admin) -----
let usuariosCache = [];
async function renderUsuarios(v) {
  usuariosCache = await api('/usuarios'); const hs = await api('/hoteis');
  const hmap = {}; hs.forEach((hh) => (hmap[hh.id] = hh.codigo || hh.nome));
  let html = `<div class="toolbar"><div class="spacer"></div><button class="btn primary" onclick="modalUsuario()">${svg(I.plus)} Novo usuário</button></div>`;
  html += tbl([{ t: 'Usuário' }, { t: 'Nome' }, { t: 'Perfil' }, { t: 'Hotéis' }, { t: 'Situação' }, { t: '', r: 1 }]);
  usuariosCache.forEach((u) => { const pill = u.role === 'admin' ? '<span class="pill in">Administrador</span>' : u.role === 'almoxarifado' ? '<span class="pill par">Almoxarifado</span>' : '<span class="pill muted">Atendente</span>';
    const hot = u.role === 'admin' ? '<span class="pill muted">todos</span>' : (u.hoteis || []).map((id) => `<span class="pill muted">${esc(hmap[id] || '?')}</span>`).join(' ') || '<span class="t-sub">—</span>';
    html += `<tr><td class="t-code">${esc(u.username)}</td><td class="t-desc">${esc(u.nome)}</td><td>${pill}</td><td>${hot}</td><td>${u.ativo === false ? '<span class="pill zero">Inativo</span>' : '<span class="pill ok">Ativo</span>'}</td>
      <td class="actions-cell"><button class="icon-btn" onclick="modalUsuario('${u.id}')">${svg(I.edit)}</button>${u.username === 'admin' ? '' : `<button class="icon-btn danger" onclick="excluirUsuario('${u.id}')">${svg(I.trash)}</button>`}</td></tr>`; });
  v.innerHTML = html + `</tbody></table></div><p class="t-sub" style="margin-top:12px">Senhas são guardadas com hash bcrypt no servidor. Novos usuários trocam a senha no primeiro acesso.</p>`;
}
async function modalUsuario(id, presetHotelId) {
  const u = id ? (usuariosCache.find((x) => x.id === id) || null) : null; const hs = await api('/hoteis'); const lockRoot = u && u.username === 'admin';
  openModal(u ? 'Editar usuário' : 'Novo usuário', `
    <div class="field-row c2"><div class="field"><label>Login <span class="req">*</span></label><input id="u_user" value="${esc(u ? u.username : '')}" ${u ? 'disabled' : ''}></div>
      <div class="field"><label>Nome <span class="req">*</span></label><input id="u_nome" value="${esc(u ? u.nome : '')}"></div></div>
    <div class="field"><label>Perfil</label><select id="u_role" ${lockRoot ? 'disabled' : ''}><option value="atendente" ${u && u.role === 'atendente' ? 'selected' : ''}>Atendente (cria requisições)</option><option value="almoxarifado" ${u && u.role === 'almoxarifado' ? 'selected' : ''}>Almoxarifado (aprova e gerencia estoque)</option><option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Administrador</option></select></div>
    <div class="field"><label>Senha ${u ? '(deixe em branco para manter)' : '<span class="req">*</span>'}</label><input id="u_pass" type="password" placeholder="${u ? '••••••••' : 'mínimo 4 caracteres'}"></div>
    ${u && u.username !== 'admin' ? `<div class="field"><label>Situação</label><select id="u_ativo"><option value="1" ${u.ativo !== false ? 'selected' : ''}>Ativo</option><option value="0" ${u.ativo === false ? 'selected' : ''}>Inativo</option></select></div>` : ''}
    <div class="field"><label>Hotéis vinculados ${u && u.role === 'admin' ? '<span class="t-sub">(admin acessa todos)</span>' : ''}</label>
      ${hs.length ? `<div class="hotel-check" id="u_hoteis">${hs.map((h) => `<label class="hcheck"><input type="checkbox" value="${h.id}" ${(u && (u.hoteis || []).includes(h.id)) || (!u && presetHotelId === h.id) ? 'checked' : ''}>${esc(h.codigo ? h.codigo + ' · ' : '')}${esc(h.nome)}</label>`).join('')}</div>` : `<p class="t-sub">Cadastre hotéis para vincular.</p>`}</div>
  `, async () => {
    const hoteis = [...document.querySelectorAll('#u_hoteis input:checked')].map((c) => c.value);
    const body = { nome: val('u_nome'), role: val('u_role'), hoteis, senha: $('u_pass').value || undefined };
    if (u && u.username !== 'admin') body.ativo = val('u_ativo') === '1';
    if (u) await api('/usuarios/' + u.id, { method: 'PUT', body });
    else { body.username = val('u_user'); await api('/usuarios', { method: 'POST', body }); }
    closeModal(); toast('Usuário salvo.', 'ok'); refresh();
  }, 'wide');
}
function excluirUsuario(id) { confirmar('Excluir usuário?', 'Ação não pode ser desfeita.', async () => { await api('/usuarios/' + id, { method: 'DELETE' }); closeModal(); toast('Usuário excluído.', 'warn'); refresh(); }, 'Excluir'); }

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
  if (!State.token) return renderLogin();
  try { const me = await api('/me'); State.user = me.user; State.hoteis = me.hoteis; localStorage.setItem('almox_user', JSON.stringify(me.user)); afterLogin(); }
  catch (e) { clearSession(); renderLogin(); }
}
window.addEventListener('DOMContentLoaded', boot);

// Expõe funções usadas em onclick inline.
Object.assign(window, { go, logout, trocarHotel, selecionarHotel, ajuda, refresh, toggleTheme, gateCriarHotel, gateAdmin,
  modalItem, excluirItem, filtraItens, modalCategoria, excluirCategoria, modalFornecedor, excluirFornecedor,
  modalEntrada, modalRequisicao, verRequisicao, aprovarRequisicao, rejeitarRequisicao,
  renderAjustes, ajSaldoAtual, salvarAjuste, addLinha, redrawLinhas,
  modalHotel, excluirHotel, modalUsuario, excluirUsuario, closeModal });
