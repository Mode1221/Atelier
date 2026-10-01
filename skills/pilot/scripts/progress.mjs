#!/usr/bin/env node
// Atelier pilot — 진행 화면. PROJECT.md 를 한 장짜리 HTML(docs/progress.html)로: 어디까지 왔나 · 다음 할 일 · 사람 할 일 · 비용.
//   node <atelier>/skills/pilot/scripts/progress.mjs [PROJECT.md]          # docs/progress.html 저장 (브라우저로 열기)
//   --json (모델만) · --out <파일>
// 개발 용어 없이 읽히게: 세부 단계 ID 는 작게, 설명을 크게. 의존성 없음, 인터넷 없이 열린다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const section = (md, name) => (md.match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))?.[1] ?? '');
const field = (text, key) => text.match(new RegExp(`^- ${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';

export function parse(md) {
  const roadmap = section(md, '로드맵');
  const stages = [...roadmap.matchAll(/^### (\d+) ([^\n]+)\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)].map(([, n, title, body]) => {
    const items = [...body.matchAll(/^- \[( |x)\] ([A-Z]\d+)\s*([^\n]*)$/gm)].map(([, x, id, rest]) => {
      const state = x === 'x' ? 'done' : /N\/A|건너뜀/.test(rest) ? 'skip' : /나중 \(빠른 길\)/.test(rest) ? 'later' : /사람 대기/.test(rest) ? 'waiting' : 'todo';
      return { id, text: rest.replace(/^[—-]\s*/, ''), state };
    });
    const count = items.filter((i) => i.state !== 'skip' && i.state !== 'later');
    const done = count.filter((i) => i.state === 'done').length;
    return { n: Number(n), title: title.trim(), items, done, total: count.length };
  });
  const cur = section(md, '현재 단계');
  const curN = Number(field(cur, '단계').match(/^\d+/)?.[0] ?? 0);
  for (const s of stages) s.status = s.total && s.done === s.total ? 'done' : s.n === curN ? 'current' : s.n < curN ? 'open' : 'next';
  const human = [...section(md, '사람 할 일').matchAll(/^- \[( |x)\] ([^\n]+)$/gm)].map(([, x, t]) => ({ done: x === 'x', text: t }));
  const all = stages.flatMap((s) => s.items).filter((i) => i.state !== 'skip' && i.state !== 'later');
  return {
    name: md.match(/^# (.+)$/m)?.[1]?.trim() ?? '프로젝트',
    oneLine: field(section(md, '개요'), '한 줄 설명'),
    stage: field(cur, '단계'), url: field(cur, '운영 주소').match(/https?:\/\/\S+/)?.[0] ?? '',
    next: field(cur, '다음 할 일'), blocked: field(cur, '막힌 것'),
    done: all.filter((i) => i.state === 'done').length, total: all.length,
    later: stages.flatMap((s) => s.items).filter((i) => i.state === 'later').length,
    stages, human, cost: section(md, '비용').trim(),
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1">$1</a>');
function table(md) {
  const rows = md.split('\n').filter((l) => l.startsWith('|') && !/^\|[-\s|]+\|$/.test(l)).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
  if (!rows.length) return '';
  return `<table><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`;
}
const MARK = { done: '✅', todo: '⬜', waiting: '⏳', later: '💤', skip: '➖' };
const LABEL = { done: '완료', current: '지금', open: '남은 것 있음', next: '예정' };

export function render(m, { now = new Date() } = {}) {
  const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
  const openHuman = m.human.filter((h) => !h.done);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.name)} 진행</title><style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--mute:#6b6b66;--card:#fff;--line:#e5e4de;--acc:#2f6f4f;--cur:#c27c0e}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mute:#9b9a94;--card:#1f1f1c;--line:#33322e;--acc:#6cc29a;--cur:#f0b54a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}h1{font-size:26px;margin:0}h2{font-size:17px;margin:28px 0 10px}
.sub{color:var(--mute);margin:4px 0 0}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0}
.big{font-size:34px;font-weight:700}.bar{height:10px;background:var(--line);border-radius:6px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:var(--acc)}
.stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.st{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--card)}
.st.current{border-color:var(--cur);box-shadow:0 0 0 1px var(--cur)}.st.done{opacity:.75}.st b{display:block}.st small{color:var(--mute)}
details{border-top:1px solid var(--line);padding:8px 0}summary{cursor:pointer;font-weight:600}ul{padding-left:0;list-style:none;margin:6px 0}li{margin:4px 0}
.id{font-size:12px;color:var(--mute);margin-right:4px}code{font-size:13px;background:var(--line);padding:1px 4px;border-radius:4px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
a{color:var(--acc);word-break:break-all}.note{color:var(--mute);font-size:13px}
</style></head><body><main>
<h1>${esc(m.name)}</h1><p class="sub">${inline(m.oneLine)}</p>
<div class="card"><div class="big">${pct}%</div><div class="bar"><i style="width:${pct}%"></i></div>
<div>${m.done}/${m.total} 완료${m.later ? ` · 나중으로 미룬 것 ${m.later}개` : ''} · 지금: <b>${esc(m.stage)}</b></div>
${m.url ? `<div>서비스 주소: <a href="${esc(m.url)}">${esc(m.url)}</a></div>` : ''}</div>
<h2>다음 할 일</h2><div class="card">${inline(m.next || '—')}${m.blocked ? `<div class="note">막힌 것: ${inline(m.blocked)}</div>` : ''}</div>
<h2>대표가 할 일 (${openHuman.length})</h2><div class="card"><ul>${openHuman.map((h) => `<li>⬜ ${inline(h.text)}</li>`).join('') || '<li>없음</li>'}</ul></div>
<h2>단계</h2><div class="stages">${m.stages.map((s) => `<div class="st ${s.status}"><b>${s.n}. ${esc(s.title.split(' — ')[0])}</b><small>${LABEL[s.status]} · ${s.done}/${s.total}</small></div>`).join('')}</div>
<div class="card">${m.stages.map((s) => `<details${s.status === 'current' ? ' open' : ''}><summary>${s.n}. ${esc(s.title)} — ${s.done}/${s.total}</summary><ul>${s.items.map((i) => `<li>${MARK[i.state]} <span class="id">${esc(i.id)}</span>${inline(i.text)}</li>`).join('')}</ul></details>`).join('')}
<p class="note">✅ 완료 · ⬜ 할 일 · ⏳ 사람 대기 · 💤 나중(빠른 길) · ➖ 해당 없음</p></div>
${m.cost ? `<h2>비용</h2><div class="card">${table(m.cost)}</div>` : ''}
<p class="note">PROJECT.md 기준 · ${now.toISOString().slice(0, 10)} 생성 · 다시 만들기: "진행 화면 보여 줘"</p>
</main></body></html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const file = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') ?? 'PROJECT.md');
  const model = parse(readFileSync(file, 'utf8'));
  if (args.includes('--json')) { console.log(JSON.stringify(model, null, 2)); process.exit(0); }
  const i = args.indexOf('--out');
  const out = i >= 0 ? resolve(args[i + 1]) : join(dirname(file), 'docs', 'progress.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(model));
  console.log(`${out} — ${model.done}/${model.total} 완료, 대표 할 일 ${model.human.filter((h) => !h.done).length}개`);
}
