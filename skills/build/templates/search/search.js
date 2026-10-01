// 검색 (D1 FTS5) — 글·상품·장소 같은 것을 제목·본문으로 찾는다. 외부 서비스·비용 없음.
//   const s = createSearch({ db: env.DB });
//   await s.index('post', id, { title, body });  // 저장·수정할 때 (같은 kind+ref 는 덮어씀)
//   await s.remove('post', id);                  // 지울 때
//   await s.query('강남 파스타', { kind: 'post' }) → [{ kind, ref, title, snippet }]
// 한국어: 3글자 이상 낱말은 색인(trigram)으로 빠르게, 2글자 이하 낱말은 LIKE 로(작은 서비스면 충분히 빠름).
// 권한: 검색 결과에서 ref 로 원본을 다시 읽어 "볼 수 있는 것만" 보여 준다(비공개 글을 색인에 넣었다면 특히).
const MAX_Q = 100;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function terms(q) {
  return String(q ?? '').slice(0, MAX_Q).replace(/["*^():]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
}
export function createSearch({ db, table = 'search_index' }) {
  return {
    async index(kind, ref, { title = '', body = '' }) {
      await db.prepare(`DELETE FROM ${table} WHERE kind = ? AND ref = ?`).bind(kind, String(ref)).run();
      await db.prepare(`INSERT INTO ${table} (kind, ref, title, body) VALUES (?, ?, ?, ?)`).bind(kind, String(ref), String(title).slice(0, 500), String(body).slice(0, 20000)).run();
    },
    async remove(kind, ref) { await db.prepare(`DELETE FROM ${table} WHERE kind = ? AND ref = ?`).bind(kind, String(ref)).run(); },
    async query(q, { kind, limit = 20, offset = 0 } = {}) {
      const t = terms(q);
      if (!t.length) return [];
      const long = t.filter((x) => [...x].length >= 3), short = t.filter((x) => [...x].length < 3);
      const where = [], args = [];
      if (long.length) { where.push(`${table} MATCH ?`); args.push(long.map((x) => `"${x}"`).join(' AND ')); }
      for (const s of short) { where.push('(title LIKE ? OR body LIKE ?)'); args.push(`%${s}%`, `%${s}%`); }
      if (kind) { where.push('kind = ?'); args.push(kind); }
      const order = long.length ? 'ORDER BY rank' : '';
      const snip = long.length ? `snippet(${table}, 3, char(1), char(2), '…', 12)` : 'substr(body, 1, 80)';
      const { results } = await db.prepare(`SELECT kind, ref, title, ${snip} AS snippet FROM ${table} WHERE ${where.join(' AND ')} ${order} LIMIT ? OFFSET ?`).bind(...args, Math.min(50, limit), Math.max(0, offset)).all();
      // 본문은 이스케이프하고 일치 부분만 <mark> — 화면에 그대로 넣어도 안전
      return results.map((r) => ({ ...r, snippet: esc(r.snippet).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>') }));
    },
  };
}
// 라우트: app.get('/api/search', ...) — snippet 은 이미 안전한 HTML(<mark> 만), title 은 화면에서 이스케이프
export function mountSearch(app, { kinds } = {}) {
  app.get('/api/search', async (c) => {
    const kind = c.req.query('kind');
    if (kind && kinds && !kinds.includes(kind)) return c.json({ error: '모르는 종류' }, 400);
    const items = await createSearch({ db: c.env.DB }).query(c.req.query('q'), { kind, offset: Number(c.req.query('offset') ?? 0) || 0 });
    return c.json({ items });
  });
}
