// 간단한 부하·응답 시간 측정 (B11, G2). 사용: node scripts/bench.js http://127.0.0.1:3000 [동시 수] [요청 수]
const [base = 'http://127.0.0.1:3000', conc = '20', total = '1000'] = process.argv.slice(2);
const j = (r) => r.json();
const h = { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1' };
const g = await fetch(`${base}/api/groups`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'bench', fine_late: 1000, fine_absent: 3000, fine_homework: 2000 }) }).then(j);
const k = { ...h, 'X-Admin-Key': g.adminKey };
const members = [];
for (let i = 0; i < 15; i++) members.push(await fetch(`${base}/api/groups/${g.id}/members`, { method: 'POST', headers: k, body: JSON.stringify({ name: `m${i}` }) }).then(j));
for (let d = 1; d <= 50; d++)
  await fetch(`${base}/api/groups/${g.id}/sessions`, { method: 'POST', headers: k, body: JSON.stringify({ date: `2026-0${1 + (d % 9)}-${String(1 + (d % 28)).padStart(2, '0')}`, entries: members.map((m, i) => ({ member_id: m.id, status: ['present', 'late', 'absent'][(i + d) % 3], homework_missed: i % 4 === 0 })) }) });

async function run(name, fn) {
  const times = []; let errors = 0; let i = 0;
  const worker = async () => { while (i++ < +total) { const t = performance.now(); try { const r = await fn(); if (!r.ok) errors++; await r.arrayBuffer(); } catch { errors++; } times.push(performance.now() - t); } };
  const start = performance.now();
  await Promise.all(Array.from({ length: +conc }, worker));
  times.sort((a, b) => a - b);
  const p = (q) => times[Math.floor(times.length * q)].toFixed(1);
  console.log(`| ${name} | ${total} | ${conc} | ${(+total / ((performance.now() - start) / 1000)).toFixed(0)} | ${p(0.5)} | ${p(0.95)} | ${errors} |`);
}
console.log('| 시나리오 | 요청 | 동시 | 초당 | p50 ms | p95 ms | 오류 |\n|---|---|---|---|---|---|---|');
await run('첫 화면', () => fetch(`${base}/`));
await run('모임 화면 (15명·50회차)', () => fetch(`${base}/g/${g.id}`));
await run('회차 저장', () => fetch(`${base}/api/groups/${g.id}/sessions`, { method: 'POST', headers: k, body: JSON.stringify({ date: '2026-09-29', entries: members.map((m) => ({ member_id: m.id, status: 'late' })) }) }));
