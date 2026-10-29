'use strict';

const store = {
  get(k, def = null) { try { const v = localStorage.getItem('pkd:' + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { v == null ? localStorage.removeItem('pkd:' + k) : localStorage.setItem('pkd:' + k, JSON.stringify(v)); } catch {} },
};

const qsApi = new URLSearchParams(location.search).get('api');
if (qsApi) store.set('api', qsApi);
const API = (store.get('api') || window.PUBLIKOU_CONFIG?.apiUrl || 'http://localhost:3333').replace(/\/+$/, '');

let session = store.get('session');
const cityNames = store.get('cityNames', {});

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const MODALITY = {
  electronic_reverse_auction: 'Pregão eletrônico', in_person_reverse_auction: 'Pregão presencial',
  procurement_exemption: 'Dispensa', sole_source_procurement: 'Inexigibilidade',
  electronic_competitive_bidding: 'Concorrência eletrônica', in_person_competitive_bidding: 'Concorrência presencial',
  electronic_auction: 'Leilão eletrônico', in_person_auction: 'Leilão presencial', competitive_dialogue: 'Diálogo competitivo',
  contest: 'Concurso', expression_of_interest: 'Manifestação de interesse', pre_qualification: 'Pré-qualificação', accreditation: 'Credenciamento',
};
const BENEFIT = {
  exclusive_participation_for_me_epp: ['Exclusivo ME/EPP', 'ok'],
  reserved_quota_for_me_epp: ['Cota ME/EPP', 'ok'],
  subcontracting_me_epp: ['Subcontratação ME/EPP', 'warn'],
};
const ERRORS = {
  network: `Não consegui falar com a API em ${API}. Ela está rodando?`,
  'error.invalid_credentials': 'E-mail ou senha incorretos.',
  'error.email_already_in_use': 'Esse e-mail já tem cadastro.',
  'error.cnpj_already_registered': 'Esse CNPJ já está cadastrado.',
  'error.cnpj_not_found': 'CNPJ não encontrado na Receita.',
  'error.cnpj_inactive': 'CNPJ inativo na Receita.',
  'error.cnpj_provider_unavailable': 'Consulta de CNPJ indisponível agora. Tente de novo.',
  'error.unsupported_company_size': 'A Publikou atende só MEI, ME e EPP.',
  'error.preferences_not_found': 'Cadastre o que você vende antes de buscar oportunidades.',
  'error.preferences_already_registered': 'As preferências já existem.',
  'error.invalid_value_range': 'Valor mínimo maior que o máximo.',
  'error.city_state_mismatch': 'O município não é dessa UF.',
  'error.forbidden': 'Sem permissão (precisa de usuário adm).',
  'error.sync_not_failed': 'Só dá para tentar de novo uma sincronização que falhou ou foi parada.',
  'error.sync_not_running': 'Essa sincronização não está rodando.',
  'error.classification_running': 'Já tem uma classificação rodando.',
  'error.classification_run_not_failed': 'Só dá para tentar de novo uma classificação que falhou ou foi parada.',
  'error.classification_run_not_running': 'Essa classificação não está rodando.',
};

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const errMsg = (e) => ERRORS[e.code] || e.message || 'Erro inesperado';

async function api(method, path, { query, body } = {}) {
  const qs = new URLSearchParams();
  if (query && query.page_size && !query.page) query = { ...query, page: 1 };
  for (const [k, v] of Object.entries(query || {})) {
    if (v == null || v === '' || v === false) continue;
    (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = 'Bearer ' + session.token;
  let res;
  try {
    res = await fetch(API + path + (qs.toString() ? '?' + qs : ''), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network', '');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    if (res.status === 401 && session && !path.startsWith('/public')) {
      logout();
      toast('Sessão expirada. Entre de novo.', true);
    }
    const fields = data && data.errors && data.errors.map((x) => `${x.failed_field} (${x.tag})`).join(', ');
    throw new ApiError(res.status, data && data.code, (data && data.message) || (fields ? 'Dados inválidos: ' + fields : res.statusText));
  }
  return data;
}

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cnpj = (s) => String(s).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const size = (s) => ({ mei: 'MEI', me: 'ME', epp: 'EPP' }[s] || s);
const fmtDate = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = ''), 3200);
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(errMsg(e), true); } finally { if (btn) btn.disabled = false; }
}

function logout() {
  session = null;
  store.set('session', null);
  location.hash = '#/login';
}

function renderTopbar() {
  const h = location.hash;
  $('#topbar').innerHTML = session ? `
    <a class="brand" href="#/fornecedores">Publikou</a>
    <nav>
      <a href="#/fornecedores" class="${h.startsWith('#/forn') ? 'active' : ''}">Minhas empresas</a>
      ${session.type === 'adm' ? `<a href="#/adm" class="${h === '#/adm' ? 'active' : ''}">Administração</a>` : ''}
    </nav>
    <span class="muted small">${esc(session.full_name)}</span>
    <button class="sm" onclick="logout()">Sair</button>` : `<span class="brand">Publikou</span><span class="muted small">API: ${esc(API)}</span>`;
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  let h = location.hash || '#/';
  if (!session && h !== '#/login') { location.hash = '#/login'; return; }
  if (session && (h === '#/login' || h === '#/')) { location.hash = '#/fornecedores'; return; }
  renderTopbar();
  const routes = [
    [/^#\/login$/, viewLogin],
    [/^#\/fornecedores$/, viewSuppliers],
    [/^#\/fornecedor\/([^/]+)\/(preferencias|oportunidades)$/, viewSupplier],
    [/^#\/adm$/, viewAdmin],
  ];
  const route = routes.find(([re]) => re.test(h));
  if (!route) { location.hash = '#/fornecedores'; return; }
  const app = $('#app');
  app.innerHTML = '<p class="center muted">Carregando…</p>';
  try {
    const view = await route[1](...h.match(route[0]).slice(1));
    if (seq !== renderSeq) return;
    app.innerHTML = view.html;
    view.mount && view.mount();
  } catch (e) {
    if (seq !== renderSeq) return;
    app.innerHTML = `<div class="banner err">${esc(errMsg(e))}</div>`;
  }
}
window.addEventListener('hashchange', render);

/* ---------- Login ---------- */

async function viewLogin() {
  return {
    html: `
    <div class="login card stack">
      <div class="seg"><button id="t-login" class="on">Entrar</button><button id="t-signup">Criar conta</button></div>
      <form id="f-auth" class="stack">
        <label class="field signup" hidden><span>Nome completo</span><input name="full_name" minlength="3"></label>
        <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
        <label class="field"><span>Senha</span><input name="password" type="password" required minlength="1" autocomplete="current-password"></label>
        <label class="field signup" hidden><span>Telefone (opcional)</span><input name="phone"></label>
        <button class="primary big" id="b-auth" style="width:100%">Entrar</button>
      </form>
      <p class="muted small">API: ${esc(API)} · troque com <code>?api=http://host:porta</code></p>
    </div>`,
    mount() {
      let signup = false;
      const toggle = (v) => {
        signup = v;
        $('#t-login').classList.toggle('on', !v);
        $('#t-signup').classList.toggle('on', v);
        document.querySelectorAll('.signup').forEach((el) => (el.hidden = !v));
        $('[name=full_name]').required = v;
        $('[name=password]').minLength = v ? 8 : 1;
        $('#b-auth').textContent = v ? 'Criar conta e entrar' : 'Entrar';
      };
      $('#t-login').onclick = () => toggle(false);
      $('#t-signup').onclick = () => toggle(true);
      $('#f-auth').onsubmit = (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        busy($('#b-auth'), async () => {
          if (signup) await api('POST', '/public/user', { body: { email: f.email, password: f.password, full_name: f.full_name, phone: f.phone || null } });
          const r = await api('POST', '/public/auth/login', { body: { email: f.email, password: f.password } });
          session = { token: r.token, id_user: r.id_user, full_name: r.full_name };
          try {
            const u = await api('GET', `/internal/user/${r.id_user}`);
            session.type = u.user.type;
          } catch {}
          store.set('session', session);
          location.hash = '#/fornecedores';
        });
      };
    },
  };
}

/* ---------- Empresas ---------- */

async function viewSuppliers() {
  const r = await api('GET', '/internal/supplier', { query: { page_size: 50 } });
  const list = r.data || [];
  return {
    html: `
    <div class="spread" style="margin-bottom:16px">
      <div><h1>Minhas empresas</h1><p class="muted" style="margin:0">Escolha a empresa para dizer o que ela vende e ver as contratações compatíveis.</p></div>
      <form id="f-sup" class="row">
        <input name="tax_id" placeholder="CNPJ da empresa" required style="width:200px">
        <button class="primary" id="b-sup">Cadastrar empresa</button>
      </form>
    </div>
    ${list.length ? `<div class="suppliers">${list.map((s) => `
      <a class="card supplier" style="text-decoration:none;color:inherit" href="#/fornecedor/${s.id_supplier}/oportunidades">
        <div class="spread"><b>${esc(s.trade_name || s.legal_name)}</b><span class="badge">${size(s.company_size)}</span></div>
        <div class="muted small">${esc(s.legal_name)}</div>
        <div class="muted small">CNPJ ${cnpj(s.tax_id)}</div>
      </a>`).join('')}</div>`
      : `<div class="card center"><h2>Nenhuma empresa ainda</h2><p class="muted">Cadastre pelo CNPJ: os dados vêm da Receita (BrasilAPI).</p></div>`}`,
    mount() {
      $('#f-sup').onsubmit = (e) => {
        e.preventDefault();
        const tax = e.target.tax_id.value.replace(/\D/g, '');
        busy($('#b-sup'), async () => {
          const r = await api('POST', '/internal/supplier', { body: { tax_id: tax } });
          toast('Empresa cadastrada: ' + (r.supplier.trade_name || r.supplier.legal_name));
          location.hash = `#/fornecedor/${r.supplier.id_supplier}/preferencias`;
        });
      };
    },
  };
}

/* ---------- Empresa: cabeçalho e abas ---------- */

const supplierCache = {};

async function viewSupplier(id, tab) {
  const s = supplierCache[id] || (supplierCache[id] = (await api('GET', `/internal/supplier/${id}`)).supplier);
  const inner = tab === 'preferencias' ? await prefsView(s) : await oppsView(s);
  return {
    html: `
    <p class="small" style="margin:0 0 6px"><a href="#/fornecedores">← Minhas empresas</a></p>
    <h1>${esc(s.trade_name || s.legal_name)} <span class="badge">${size(s.company_size)}</span></h1>
    <p class="muted" style="margin:0 0 14px">${esc(s.legal_name)} · CNPJ ${cnpj(s.tax_id)}</p>
    <div class="tabs">
      <a href="#/fornecedor/${id}/oportunidades" class="${tab === 'oportunidades' ? 'active' : ''}">Oportunidades</a>
      <a href="#/fornecedor/${id}/preferencias" class="${tab === 'preferencias' ? 'active' : ''}">O que eu vendo</a>
    </div>
    ${inner.html}`,
    mount: inner.mount,
  };
}

/* ---------- Preferências e catálogo ---------- */

let P, C, S;

async function prefsView(s) {
  S = s;
  let res = null;
  try { res = await api('GET', `/internal/supplier/${s.id_supplier}/preferences`); } catch (e) { if (e.status !== 404) throw e; }
  const p = (res && res.preferences) || {};
  const { catalog_class_ids, catalog_item_ids, keywords, locations, id_supplier_preferences, id_supplier, ...rest } = p;
  P = {
    exists: !!res,
    classes: new Map((res?.catalog_classes || []).map((c) => [c.id_catalog_class, c])),
    items: new Map((res?.catalog_items || []).map((i) => [i.id_catalog_item, i])),
    keywords: keywords || [],
    locations: (locations || []).map((l) => ({ state_code: l.state_code, id_city: l.id_city })),
    rest,
  };
  C = { type: 'material', q: '', group: null, cls: null, rows: [], total: 0, page: 1, kind: 'group' };

  return {
    html: `
    ${P.exists ? '' : '<div class="banner" style="margin-bottom:14px">Escolha no catálogo o que sua empresa vende. Depois é só buscar as oportunidades.</div>'}
    <div class="grid2">
      <div class="card">
        <div class="spread"><h2>Catálogo de compras do governo</h2>
          <div class="seg"><button data-type="material" class="on">Materiais</button><button data-type="service">Serviços</button></div>
        </div>
        <input id="cat-q" placeholder="Buscar item pelo nome (ex.: cadeira escritório, limpeza predial)" style="width:100%;margin:6px 0 10px">
        <div id="catalog"></div>
      </div>
      <div class="stack">
        <div class="card" id="selection"></div>
        <div class="card stack" id="filters">
          <h2>Filtros</h2>
          <div class="row">
            <label class="field" style="flex:1"><span>Valor mínimo (R$)</span><input id="p-vmin" type="number" min="0" value="${p.value_min ?? ''}"></label>
            <label class="field" style="flex:1"><span>Valor máximo (R$)</span><input id="p-vmax" type="number" min="0" value="${p.value_max ?? ''}"></label>
            <label class="field" style="flex:1"><span>Dias mínimos até fechar</span><input id="p-days" type="number" min="0" max="60" value="${p.min_days_to_close ?? ''}"></label>
          </div>
          <div class="row">
            <label class="check"><input type="checkbox" id="p-mat" ${p.material !== false ? 'checked' : ''}> Materiais</label>
            <label class="check"><input type="checkbox" id="p-srv" ${p.service !== false ? 'checked' : ''}> Serviços</label>
          </div>
          <div>
            <span class="muted small">Só itens exclusivos ou com cota para:</span>
            <div class="row">${['mei', 'me', 'epp'].map((x) => `<label class="check"><input type="checkbox" class="p-excl" value="${x}" ${(p.company_size_exclusivity || []).includes(x) ? 'checked' : ''}> ${size(x)}</label>`).join('')}</div>
          </div>
        </div>
        <div class="row">
          <button class="big" id="b-save">Salvar</button>
          <button class="primary big" id="b-save-match">Salvar e buscar oportunidades</button>
        </div>
      </div>
    </div>`,
    mount() {
      document.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => {
        C.type = b.dataset.type; C.group = null; C.cls = null;
        document.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === b));
        catLoad();
      }));
      let t;
      $('#cat-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { C.q = e.target.value.trim(); catLoad(); }, 300); };
      $('#b-save').onclick = (e) => busy(e.target, () => savePrefs());
      $('#b-save-match').onclick = (e) => busy(e.target, async () => {
        await savePrefs();
        const r = await api('POST', `/internal/supplier/${S.id_supplier}/match`);
        store.set('lastMatch:' + S.id_supplier, { ...r.result, at: Date.now() });
        location.hash = `#/fornecedor/${S.id_supplier}/oportunidades`;
      });
      renderSelection();
      catLoad();
    },
  };
}

async function catLoad(append = false) {
  const el = $('#catalog');
  if (!el) return;
  C.page = append ? C.page + 1 : 1;
  if (!append) el.innerHTML = '<div class="list"><div class="empty">Carregando…</div></div>';
  try {
    let r;
    if (C.q.length >= 2) {
      C.kind = 'search';
      r = await api('GET', '/internal/catalog/item', { query: { type: C.type, name: C.q, page: C.page, page_size: 30 } });
    } else if (C.cls) {
      C.kind = 'item';
      r = await api('GET', '/internal/catalog/item', { query: { id_catalog_class: C.cls.id_catalog_class, page: C.page, page_size: 50 } });
    } else if (C.group) {
      C.kind = 'class';
      r = await api('GET', `/internal/catalog/group/${C.group.id_catalog_group}/class`, { query: { page: C.page, page_size: 50 } });
    } else {
      C.kind = 'group';
      r = await api('GET', '/internal/catalog/group', { query: { type: C.type, page: C.page, page_size: 50 } });
    }
    C.rows = append ? C.rows.concat(r.data || []) : (r.data || []);
    C.total = r.total;
    renderCatalog();
  } catch (e) {
    el.innerHTML = `<div class="banner err">${esc(errMsg(e))}</div>`;
  }
}

function renderCatalog() {
  const el = $('#catalog');
  if (!el) return;
  const crumbs = C.kind === 'search'
    ? `<span class="muted">${C.total} resultado(s) para “${esc(C.q)}”</span>`
    : [`<a onclick="catGo()">Grupos</a>`, C.group && `<a onclick="catGo('${C.group.id_catalog_group}')">${esc(C.group.name)}</a>`, C.cls && `<b>${esc(C.cls.name)}</b>`].filter(Boolean).join(' › ');
  const rows = C.rows.map((r, i) => {
    if (C.kind === 'group') return `<div class="li"><span class="name" onclick="catOpenGroup(${i})">${esc(r.name)}</span><span class="muted small">${r.code}</span></div>`;
    if (C.kind === 'class') {
      const on = P.classes.has(r.id_catalog_class);
      return `<div class="li"><span class="name" onclick="catOpenClass(${i})">${esc(r.name)} <span class="muted small">› itens</span></span>
        <button class="sm ${on ? 'ok-on' : ''}" onclick="pickClass(${i})">${on ? '✓ Classe' : '+ Classe inteira'}</button></div>`;
    }
    const on = P.items.has(r.id_catalog_item), clsOn = P.classes.has(r.id_catalog_class);
    return `<div class="li"><div><div>${esc(r.name)}</div>${C.kind === 'search' ? `<div class="muted small">${esc(r.class_name)} · ${esc(r.group_name)}</div>` : ''}</div>
      <div class="row" style="flex-wrap:nowrap">
        <button class="sm ${on ? 'ok-on' : ''}" onclick="pickItem(${i})">${on ? '✓ Item' : '+ Item'}</button>
        ${C.kind === 'search' ? `<button class="sm ${clsOn ? 'ok-on' : ''}" onclick="pickClassOf(${i})">${clsOn ? '✓ Classe' : '+ Classe'}</button>` : ''}
      </div></div>`;
  }).join('');
  el.innerHTML = `<div class="crumbs">${crumbs}</div>
    <div class="list">${rows || '<div class="empty">Nada encontrado.</div>'}</div>
    ${C.rows.length < C.total ? `<p><button class="sm" onclick="catLoad(true)">Carregar mais (${C.total - C.rows.length})</button></p>` : ''}
    <p class="muted small">“Classe inteira” casa com qualquer item daquela classe. “Item” é mais preciso e dá nota maior.</p>`;
}

function catGo(groupId) {
  if (!groupId) C.group = null;
  C.cls = null;
  catLoad();
}
function catOpenGroup(i) { C.group = C.rows[i]; C.cls = null; catLoad(); }
function catOpenClass(i) { C.cls = C.rows[i]; catLoad(); }
function toggle(map, id, value) { map.has(id) ? map.delete(id) : map.set(id, value); renderSelection(); renderCatalog(); }
function pickClass(i) { const r = C.rows[i]; toggle(P.classes, r.id_catalog_class, r); }
function pickItem(i) { const r = C.rows[i]; toggle(P.items, r.id_catalog_item, r); }
function pickClassOf(i) {
  const r = C.rows[i];
  toggle(P.classes, r.id_catalog_class, { id_catalog_class: r.id_catalog_class, name: r.class_name, type: r.type });
}

function renderSelection() {
  const el = $('#selection');
  if (!el) return;
  const tag = (t) => `<span class="tag">${t === 'service' ? 'serv' : 'mat'}</span>`;
  const classes = [...P.classes.values()].map((c) => `<span class="chip">${tag(c.type)} ${esc(c.name)}<button onclick="unpick('classes','${c.id_catalog_class}')">×</button></span>`).join('');
  const items = [...P.items.values()].map((i) => `<span class="chip">${tag(i.type)} ${esc(i.name)}<button onclick="unpick('items','${i.id_catalog_item}')">×</button></span>`).join('');
  const kws = P.keywords.map((k, i) => `<span class="chip">${esc(k)}<button onclick="dropKeyword(${i})">×</button></span>`).join('');
  const locs = P.locations.map((l, i) => `<span class="chip">${l.id_city ? esc(cityNames[l.id_city] || 'Município') + '/' : 'Todo o estado: '}${l.state_code}<button onclick="dropLocation(${i})">×</button></span>`).join('');
  el.innerHTML = `
    <h2>O que eu vendo</h2>
    <h3>Classes <span class="muted small">(${P.classes.size})</span></h3>
    <div class="chips">${classes || '<span class="muted small">Nenhuma classe.</span>'}</div>
    <h3 style="margin-top:12px">Itens <span class="muted small">(${P.items.size})</span></h3>
    <div class="chips">${items || '<span class="muted small">Nenhum item.</span>'}</div>
    <h3 style="margin-top:12px">Palavras-chave na descrição</h3>
    <div class="chips">${kws}</div>
    <form class="row" style="margin-top:6px" onsubmit="addKeyword(event)"><input id="kw" placeholder="ex.: toner, uniforme" style="flex:1"><button class="sm">Adicionar</button></form>
    <h3 style="margin-top:12px">Onde atendo</h3>
    <div class="chips">${locs || `<span class="muted small">Vazio: só o estado da empresa.</span>`}</div>
    <div class="row" style="margin-top:6px;position:relative">
      <select id="loc-uf">${UFS.map((u) => `<option>${u}</option>`).join('')}</select>
      <input id="loc-city" placeholder="Município (opcional)" style="flex:1" autocomplete="off">
      <button class="sm" onclick="addState()">Estado inteiro</button>
    </div>
    <div id="city-results"></div>`;
  let t;
  $('#loc-city').oninput = (e) => {
    clearTimeout(t);
    const q = e.target.value.trim();
    if (q.length < 2) { $('#city-results').innerHTML = ''; return; }
    t = setTimeout(async () => {
      try {
        const r = await api('GET', '/internal/city', { query: { q, state: $('#loc-uf').value, page_size: 8 } });
        window._cities = r.data || [];
        $('#city-results').innerHTML = `<div class="list" style="margin-top:6px">${_cities.map((c, i) => `<div class="li"><span class="name" onclick="addCity(${i})">${esc(c.name)}/${c.state_code}</span></div>`).join('') || '<div class="empty">Nenhum município.</div>'}</div>`;
      } catch (err) { toast(errMsg(err), true); }
    }, 250);
  };
}

function unpick(kind, id) { P[kind].delete(id); renderSelection(); renderCatalog(); }
function addKeyword(e) {
  e.preventDefault();
  const v = $('#kw').value.trim();
  if (v.length < 2) return toast('Palavra-chave com pelo menos 2 letras.', true);
  if (!P.keywords.includes(v)) P.keywords.push(v);
  renderSelection();
  $('#kw').focus();
}
function dropKeyword(i) { P.keywords.splice(i, 1); renderSelection(); }
function dropLocation(i) { P.locations.splice(i, 1); renderSelection(); }
function addState() {
  const uf = $('#loc-uf').value;
  if (!P.locations.some((l) => l.state_code === uf && !l.id_city)) P.locations.push({ state_code: uf, id_city: null });
  renderSelection();
}
function addCity(i) {
  const c = window._cities[i];
  cityNames[c.id_city] = c.name;
  store.set('cityNames', cityNames);
  if (!P.locations.some((l) => l.id_city === c.id_city)) P.locations.push({ state_code: c.state_code, id_city: c.id_city });
  renderSelection();
}

async function savePrefs() {
  const num = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
  const body = {
    ...P.rest,
    catalog_class_ids: [...P.classes.keys()],
    catalog_item_ids: [...P.items.keys()],
    keywords: P.keywords,
    locations: P.locations,
    value_min: num('#p-vmin'),
    value_max: num('#p-vmax'),
    min_days_to_close: num('#p-days'),
    material: $('#p-mat').checked,
    service: $('#p-srv').checked,
    company_size_exclusivity: [...document.querySelectorAll('.p-excl:checked')].map((x) => x.value),
  };
  if (!body.catalog_class_ids.length && !body.catalog_item_ids.length && !body.keywords.length) {
    throw new ApiError(0, null, 'Escolha pelo menos uma classe, um item ou uma palavra-chave.');
  }
  await api(P.exists ? 'PUT' : 'POST', `/internal/supplier/${S.id_supplier}/preferences`, { body });
  P.exists = true;
  toast('Preferências salvas.');
}

/* ---------- Oportunidades ---------- */

let O;

async function oppsView(s) {
  S = s;
  O = { filter: 'open', closed: false, rows: [], total: 0, page: 1, expanded: new Set() };
  const last = store.get('lastMatch:' + s.id_supplier);
  return {
    html: `
    <div class="card spread" style="margin-bottom:14px;align-items:center">
      <div>
        <h2 style="margin:0">Contratações compatíveis</h2>
        <p class="muted small" id="last-match" style="margin:2px 0 0">${last ? lastMatchText(last) : 'O match ainda não rodou para esta empresa.'}</p>
      </div>
      <button class="primary big" id="b-match">Fazer match agora</button>
    </div>
    <div class="row" style="margin-bottom:12px">
      <div class="seg" id="o-filter">
        <button data-f="open" class="on">Novas e de interesse</button>
        <button data-f="interested">Me interessa</button>
        <button data-f="discarded">Descartadas</button>
      </div>
      <label class="check small"><input type="checkbox" id="o-closed"> Incluir prazos encerrados</label>
      <span class="muted small" id="o-count"></span>
    </div>
    <div id="opps" class="stack"></div>`,
    mount() {
      $('#b-match').onclick = (e) => busy(e.target, runMatch);
      document.querySelectorAll('#o-filter button').forEach((b) => (b.onclick = () => {
        O.filter = b.dataset.f;
        document.querySelectorAll('#o-filter button').forEach((x) => x.classList.toggle('on', x === b));
        oppLoad();
      }));
      $('#o-closed').onchange = (e) => { O.closed = e.target.checked; oppLoad(); };
      oppLoad();
    },
  };
}

function lastMatchText(m) {
  return `Último match: ${m.opportunities} contratação(ões), ${m.items} item(ns) compatível(is) · ${fmtDate(m.at)}`;
}

async function runMatch() {
  try {
    const r = await api('POST', `/internal/supplier/${S.id_supplier}/match`);
    const m = { ...r.result, at: Date.now() };
    store.set('lastMatch:' + S.id_supplier, m);
    $('#last-match').textContent = lastMatchText(m);
    toast(`Match feito: ${m.opportunities} contratação(ões) compatível(is).`);
    await oppLoad();
  } catch (e) {
    if (e.code === 'error.preferences_not_found') {
      $('#opps').innerHTML = `<div class="banner err">${esc(errMsg(e))} <a href="#/fornecedor/${S.id_supplier}/preferencias">Ir para “O que eu vendo”</a></div>`;
      return;
    }
    throw e;
  }
}

async function oppLoad(append = false) {
  O.page = append ? O.page + 1 : 1;
  if (!append) $('#opps').innerHTML = '<p class="center muted">Carregando…</p>';
  try {
    const r = await api('GET', `/internal/supplier/${S.id_supplier}/opportunity`, {
      query: { status: O.filter === 'open' ? null : O.filter, closed: O.closed, page: O.page, page_size: 20 },
    });
    O.rows = append ? O.rows.concat(r.data || []) : (r.data || []);
    O.total = r.total;
    renderOpps();
  } catch (e) {
    $('#opps').innerHTML = `<div class="banner err">${esc(errMsg(e))}</div>`;
  }
}

function closesText(d) {
  const ms = new Date(d) - Date.now();
  if (ms <= 0) return `<span class="badge err">Encerrada ${fmtDate(d)}</span>`;
  const days = Math.floor(ms / 86400000);
  const cls = days < 2 ? 'warn' : '';
  return `<span class="badge ${cls}">${days ? `Fecha em ${days} dia(s)` : 'Fecha hoje'}</span> <span class="small">${fmtDate(d)}</span>`;
}

function oppCard(o, i) {
  const pct = Math.min(100, Math.round((o.score / 1.2) * 100));
  const open = O.expanded.has(o.id_opportunity_match);
  const items = o.items || [];
  return `<div class="card opp">
    <div class="score"><b>${o.score.toFixed(2)}</b><span class="muted small">nota</span><div class="bar"><i style="width:${pct}%"></i></div></div>
    <div>
      <div class="spread">
        <h3 style="margin:0">${esc(o.procurement_object || 'Contratação sem objeto informado')}</h3>
        ${o.status === 'interested' ? '<span class="badge ok">Me interessa</span>' : o.status === 'discarded' ? '<span class="badge err">Descartada</span>' : ''}
      </div>
      <div class="meta">
        <span>${esc(o.buyer_name)}${o.buyer_unit_name && o.buyer_unit_name !== o.buyer_name ? ' · ' + esc(o.buyer_unit_name) : ''}</span>
        <span>${esc(o.city_name)}/${o.state_code}</span>
        <span>${MODALITY[o.modality] || o.modality}</span>
        <span>Estimado ${brl(o.estimated_value)}</span>
        <span>${closesText(o.proposal_closes_at)}</span>
      </div>
      <div class="why"><b>Por quê:</b> ${esc(o.description)}</div>
      <div class="row" style="margin-top:10px">
        <button class="sm ${o.status === 'interested' ? 'ok-on' : ''}" onclick="setStatus(${i},'interested')">👍 Me interessa</button>
        <button class="sm ${o.status === 'discarded' ? 'err-on' : ''}" onclick="setStatus(${i},'discarded')">Não é pra mim</button>
        <button class="sm link" onclick="toggleItems(${i})">${open ? 'Esconder' : 'Ver'} itens compatíveis (${o.matched_item_count ?? items.length})</button>
        ${o.origin_url ? `<a class="small" href="${esc(o.origin_url)}" target="_blank" rel="noopener">Abrir no PNCP ↗</a>` : ''}
        <span class="muted small">${esc(o.external_id_procurement)}</span>
      </div>
      ${open ? `<table style="margin-top:10px"><thead><tr><th>Item</th><th>Qtd.</th><th>Valor total</th><th>Nota</th><th>Por quê</th></tr></thead><tbody>
        ${items.map((it) => {
          const b = BENEFIT[it.benefit_type];
          return `<tr><td>${esc(it.description || '—')} ${b ? `<span class="badge ${b[1]}">${b[0]}</span>` : ''}</td>
            <td>${it.quantity ?? '—'} ${esc(it.unit_of_measurement || '')}</td><td>${brl(it.total_value)}</td>
            <td>${it.score.toFixed(2)}</td><td class="small">${esc(it.reason)}</td></tr>`;
        }).join('')}</tbody></table>` : ''}
    </div>
  </div>`;
}

function renderOpps() {
  $('#o-count').textContent = O.total ? `${O.total} resultado(s)` : '';
  $('#opps').innerHTML = O.rows.length
    ? O.rows.map(oppCard).join('') + (O.rows.length < O.total ? `<p class="center"><button onclick="oppLoad(true)">Carregar mais</button></p>` : '')
    : `<div class="card center"><h3>Nenhuma contratação aqui</h3><p class="muted">${O.filter === 'open'
      ? `Clique em <b>Fazer match agora</b>. Se continuar vazio, amplie <a href="#/fornecedor/${S.id_supplier}/preferencias">o que você vende</a> ou os locais atendidos.`
      : 'Nada marcado com esse status.'}</p></div>`;
}

function toggleItems(i) {
  const id = O.rows[i].id_opportunity_match;
  O.expanded.has(id) ? O.expanded.delete(id) : O.expanded.add(id);
  renderOpps();
}

async function setStatus(i, status) {
  const o = O.rows[i];
  const next = o.status === status ? null : status;
  await busy(null, async () => {
    const r = await api('PATCH', `/internal/opportunity/${o.id_opportunity_match}`, { body: { status: next } });
    o.status = r.opportunity.status;
    renderOpps();
  });
}

/* ---------- Administração ---------- */

async function viewAdmin() {
  if (session.type !== 'adm') throw new ApiError(403, 'error.forbidden', '');
  const [syncs, runs, stats] = await Promise.all([
    api('GET', '/internal/sync', { query: { page_size: 15 } }),
    api('GET', '/internal/classification/run', { query: { page_size: 10 } }).catch(() => null),
    api('GET', '/internal/classification/stats').catch(() => null),
  ]);
  const pct = (v) => v == null ? '—' : Math.round(v * 100) + '%';
  const statusBadge = (s) => `<span class="badge ${s === 'success' ? 'ok' : s === 'failed' ? 'err' : 'warn'}">${s}</span>`;
  const actions = (s, kind, id) => s === 'running'
    ? `<button class="sm" onclick="stopRun('${kind}', '${id}', this)">Parar</button>`
    : s === 'failed' || s === 'stopped' ? `<button class="sm" onclick="retryRun('${kind}', '${id}', this)">Tentar de novo</button>` : '';
  const jobs = [
    ['sync-insert', 'Buscar contratações novas', 'Baixa do PNCP as contratações publicadas na janela configurada.'],
    ['sync-update', 'Atualizar contratações', 'Reconsulta as contratações abertas para pegar mudanças.'],
    ['classify-pending', 'Classificar itens', 'Liga os itens sem classe ao catálogo CATMAT/CATSER.'],
  ];
  const running = (syncs.data || []).some((s) => s.status === 'running') || (runs?.data || []).some((r) => r.status === 'running');
  return {
    html: `
    <h1>Administração</h1>
    <p class="muted">Rode o pipeline na mão para ter dados na demo: buscar, depois classificar, depois o match na empresa.</p>
    <div class="suppliers" style="margin-bottom:16px">
      ${jobs.map(([j, t, d]) => `<div class="card stack"><b>${t}</b><span class="muted small">${d}</span><button onclick="runJob('${j}', this)">Rodar ${j}</button></div>`).join('')}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="spread"><h2>Sincronizações recentes</h2><button class="sm" onclick="render()">Atualizar</button></div>
      <table><thead><tr><th>Início</th><th>Tipo</th><th>Modalidade</th><th>Janela</th><th>Status</th><th>Página</th><th>Contratações</th><th></th></tr></thead><tbody>
      ${(syncs.data || []).map((s) => `<tr><td>${fmtDate(s.started_at)}</td><td>${s.type || '—'}</td><td>${MODALITY[s.modality] || s.modality || '—'}</td>
        <td class="small">${new Date(s.window_start).toLocaleDateString('pt-BR')} – ${new Date(s.window_end).toLocaleDateString('pt-BR')}</td>
        <td>${statusBadge(s.status)}</td><td>${esc(s.cursor ?? '—')}</td><td>${s.procurement_count ?? '—'}</td>
        <td>${actions(s.status, 'sync', s.id_sync)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nenhuma sincronização ainda.</td></tr>'}
      </tbody></table>
    </div>
    ${runs ? `<div class="card" style="margin-bottom:16px">
      <div class="spread"><h2>Classificações recentes</h2><button class="sm" onclick="render()">Atualizar</button></div>
      <table><thead><tr><th>Início</th><th>Fim</th><th>Status</th><th>Itens lidos</th><th>Classificados</th><th>Cursor</th><th></th></tr></thead><tbody>
      ${runs.data.map((r) => `<tr><td>${fmtDate(r.started_at)}</td><td>${r.finished_at ? fmtDate(r.finished_at) : '—'}</td><td>${statusBadge(r.status)}</td>
        <td>${r.item_count}</td><td>${r.classified_count}${r.item_count ? ` <span class="muted small">(${pct(r.classified_count / r.item_count)})</span>` : ''}</td>
        <td class="small muted">${esc(r.cursor ?? '—')}</td><td>${actions(r.status, 'classification/run', r.id_classification_run)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma classificação ainda.</td></tr>'}
      </tbody></table>
    </div>` : ''}
    ${stats ? `<div class="card"><h2>Classificação dos itens (contratações abertas)</h2>
      <table><thead><tr><th>Tipo</th><th>Itens</th><th>Com classe</th><th>Conferidos</th><th>Precisão</th><th>Por método</th></tr></thead><tbody>
      ${stats.types.map((t) => `<tr><td>${t.type === 'service' ? 'Serviço' : 'Material'}</td><td>${t.total}</td><td>${pct(t.covered)}</td><td>${t.reviewed}</td><td>${pct(t.precision)}</td>
        <td class="small">${t.methods.filter((m) => m.count).map((m) => `${m.method}: ${m.count}`).join(' · ')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`,
    // Enquanto algo roda, atualiza sozinho para acompanhar página, contagem e status.
    mount: () => {
      if (!running) return;
      const seq = renderSeq;
      setTimeout(() => { if (seq === renderSeq && location.hash === '#/adm') render(); }, 5000);
    },
  };
}

function runJob(job, btn) {
  busy(btn, async () => {
    await api('POST', `/internal/job/${job}/run`);
    toast(`${job} iniciado em segundo plano.`);
    render();
  });
}

function retryRun(kind, id, btn) {
  busy(btn, async () => {
    await api('POST', `/internal/${kind}/${id}/retry`);
    toast('Retentativa iniciada.');
    render();
  });
}

function stopRun(kind, id, btn) {
  busy(btn, async () => {
    await api('POST', `/internal/${kind}/${id}/stop`);
    toast('Parada pedida: termina depois da página atual.');
    render();
  });
}

render();
