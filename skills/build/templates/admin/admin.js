// 운영자 화면 (읽기 전용 데이터 보기 + 검색 + CSV) — 개발을 몰라도 "가입자·주문·의견"을 직접 본다.
//   mountAdmin(app, { tables: { pay_orders: '주문', feedback: '의견' }, hide: ['payment_key', 'billing_key'] })
//   → https://<서비스>/admin  (ADMIN_TOKEN 으로 열기 — npm run deploy:first 가 auto 로 만들어 .atelier/secrets.json 에 둔다)
// 원칙: 보여 줄 표·숨길 칸은 코드에 적은 것만(나머지는 안 보임), 쓰기 기능 없음(환불 같은 일은 각 기능의 운영자 API 로), 열어 본 기록을 남김.
const PAGE = 50;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createAdmin({ db, tables, hide = [] }) {
  const cols = async (t) => (await db.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name).filter((c) => !hide.includes(c));
  const allowed = (t) => Object.hasOwn(tables, t) && /^[a-z_][a-z0-9_]*$/i.test(t);
  return {
    list: () => Object.entries(tables).map(([key, label]) => ({ key, label })),
    async rows(t, { q = '', page = 0, sort } = {}) {
      if (!allowed(t)) throw Object.assign(new Error('볼 수 없는 표예요'), { status: 404 });
      const c = await cols(t);
      const order = c.includes(sort) ? sort : c.includes('created_at') ? 'created_at' : c[0];
      const where = q ? `WHERE ${c.map((x) => `CAST(${x} AS TEXT) LIKE ?`).join(' OR ')}` : '';
      const args = q ? c.map(() => `%${q}%`) : [];
      const total = (await db.prepare(`SELECT COUNT(*) AS n FROM ${t} ${where}`).bind(...args).first()).n;
      const rows = (await db.prepare(`SELECT ${c.join(', ')} FROM ${t} ${where} ORDER BY ${order} DESC LIMIT ? OFFSET ?`).bind(...args, PAGE, Math.max(0, page) * PAGE).all()).results;
      return { columns: c, rows, total, page, pages: Math.ceil(total / PAGE) };
    },
    async csv(t, opts = {}) {
      const all = [];
      for (let page = 0; page < 200; page++) { const r = await this.rows(t, { ...opts, page }); all.push(...r.rows); if (page + 1 >= r.pages) { const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`; return `﻿${[r.columns.map(cell).join(','), ...all.map((row) => r.columns.map((k) => cell(row[k])).join(','))].join('\r\n')}`; } }
      return '';
    },
  };
}

export function mountAdmin(app, { tables, hide = [], log = (o) => console.log(JSON.stringify(o)) } = {}) {
  const admin = (c) => createAdmin({ db: c.env.DB, tables, hide });
  const authed = (c) => { const t = c.env.ADMIN_TOKEN; return t && c.req.header('authorization') === `Bearer ${t}`; };
  app.get('/admin', (c) => c.html(PAGE_HTML));
  app.get('/api/admin/tables', (c) => (authed(c) ? c.json(admin(c).list()) : c.json({ error: '운영자 열쇠가 필요해요' }, 401)));
  app.get('/api/admin/rows/:t', async (c) => {
    if (!authed(c)) return c.json({ error: '운영자 열쇠가 필요해요' }, 401);
    log({ event: 'admin_view', table: c.req.param('t') });
    try { return c.json(await admin(c).rows(c.req.param('t'), { q: c.req.query('q') ?? '', page: Number(c.req.query('page') ?? 0) })); } catch (e) { return c.json({ error: e.message }, e.status ?? 500); }
  });
  app.get('/api/admin/csv/:t', async (c) => {
    if (!authed(c)) return c.json({ error: '운영자 열쇠가 필요해요' }, 401);
    log({ event: 'admin_export', table: c.req.param('t') });
    return new Response(await admin(c).csv(c.req.param('t'), { q: c.req.query('q') ?? '' }), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${c.req.param('t')}.csv"` } });
  });
}

// 운영자 화면 (열쇠는 이 탭에만 기억 — 탭을 닫으면 잊는다)
export const PAGE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>운영자</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#fafafa;color:#1b1b1f}table{border-collapse:collapse;width:100%;background:#fff}th,td{border-bottom:1px solid #e5e5e5;padding:6px 8px;text-align:left;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}th{position:sticky;top:0;background:#f0f0f3}.wrap{overflow:auto;max-height:70vh}button,input,select{font:inherit;min-height:36px;padding:0 10px}@media (prefers-color-scheme:dark){body{background:#151518;color:#eee}table{background:#1e1e22}th{background:#26262b}th,td{border-color:#333}}</style></head>
<body><h1 style="font-size:18px">운영자 화면 <small style="font-weight:400;color:#888">읽기 전용</small></h1>
<form id="login"><label>운영자 열쇠 <input id="tok" type="password" autocomplete="off"></label> <button>열기</button></form>
<div id="app" hidden><p><select id="t"></select> <input id="q" placeholder="검색"> <button id="go">보기</button> <button id="csv">CSV 내려받기</button> <span id="info"></span></p><div class="wrap"><table id="tbl"></table></div><p><button id="prev">이전</button> <button id="next">다음</button></p></div>
<script>
let tok = sessionStorage.getItem('adm') || '', page = 0;
const $ = (id) => document.getElementById(id);
const api = (p) => fetch(p, { headers: { authorization: 'Bearer ' + tok } }).then(async (r) => { if (r.status === 401) { sessionStorage.removeItem('adm'); throw new Error('열쇠가 맞지 않아요'); } return r; });
const cell = (v) => { const td = document.createElement('td'); td.textContent = v ?? ''; td.title = v ?? ''; return td; };
async function load() {
  const r = await (await api('/api/admin/rows/' + $('t').value + '?page=' + page + '&q=' + encodeURIComponent($('q').value))).json();
  if (r.error) return alert(r.error);
  const tbl = $('tbl'); tbl.innerHTML = '';
  const h = document.createElement('tr'); r.columns.forEach((c) => { const th = document.createElement('th'); th.textContent = c; h.append(th); }); tbl.append(h);
  r.rows.forEach((row) => { const tr = document.createElement('tr'); r.columns.forEach((c) => tr.append(cell(row[c]))); tbl.append(tr); });
  $('info').textContent = r.total + '건 · ' + (r.page + 1) + '/' + Math.max(1, r.pages) + '쪽';
}
async function start() {
  const list = await (await api('/api/admin/tables')).json();
  $('t').innerHTML = ''; list.forEach((x) => { const o = document.createElement('option'); o.value = x.key; o.textContent = x.label; $('t').append(o); });
  $('login').hidden = true; $('app').hidden = false; load();
}
$('login').onsubmit = (e) => { e.preventDefault(); tok = $('tok').value; sessionStorage.setItem('adm', tok); start().catch((x) => alert(x.message)); };
$('go').onclick = () => { page = 0; load(); };
$('prev').onclick = () => { page = Math.max(0, page - 1); load(); };
$('next').onclick = () => { page++; load(); };
$('csv').onclick = async () => { const b = await (await api('/api/admin/csv/' + $('t').value + '?q=' + encodeURIComponent($('q').value))).blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = $('t').value + '.csv'; a.click(); };
if (tok) start().catch(() => {});
</script></body></html>`;
