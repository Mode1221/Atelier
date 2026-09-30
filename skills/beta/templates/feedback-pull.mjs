#!/usr/bin/env node
// Atelier beta — GitHub 없이 베타 의견 가져오기 (AI 회사 로컬 모드).
// 서비스의 "의견 보내기"에 쌓인 것을 company/<서비스>/feedback/<날짜>.json 에 모으고, 옮긴 것까지 서비스에 표시(ack)한다.
// 서비스 계약은 feedback-sync.mjs 와 같다 (references/feedback-contract.md).
// 주소: company/<서비스>/service.json 의 url (또는 SERVICE_URL). 토큰: .atelier/secrets.json 의 FEEDBACK_TOKEN
//   (npm run deploy:first 가 만들어 둔다 — .dev.vars.example 에 FEEDBACK_TOKEN=auto) 또는 환경변수 FEEDBACK_TOKEN.
// 사용 (프로젝트 폴더에서): node scripts/feedback-pull.mjs [서비스ID]
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const writeJson = (p, d) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(`${p}.tmp`, `${JSON.stringify(d, null, 2)}\n`); renameSync(`${p}.tmp`, p); };

export function pickService(root, given) {
  if (given) return given;
  const dir = join(root, 'company');
  const ids = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'service.json'))) : [];
  if (ids.length === 1) return ids[0];
  throw new Error(ids.length ? `서비스 ID 를 적어 주세요: ${ids.join(', ')}` : 'company/ 가 없어요 — /atelier:company setup');
}

// 가져온 항목을 날짜 파일에 합친다 (같은 원본 id 는 한 번만). status 는 새 의견이 있으면 new 로.
export function merge(doc, items, date) {
  const cur = doc ?? { date, count: 0, items: [], summary: '', status: 'new' };
  const seen = new Set(cur.items.map((i) => i.sid));
  const add = items.filter((i) => !seen.has(i.id)).map((i) => ({ sid: i.id, kind: i.kind, message: i.message, page: i.page, at: i.created_at, action: '' }));
  const next = { ...cur, items: [...cur.items, ...add] };
  next.count = next.items.length;
  if (add.length) next.status = 'new';
  return { doc: next, added: add.length };
}

export async function pull({ root = process.cwd(), service, env = process.env, fetchImpl = fetch, now = new Date(), log = console.log } = {}) {
  const id = pickService(root, service);
  const svc = readJson(join(root, 'company', id, 'service.json')) ?? {};
  const url = (env.SERVICE_URL || svc.url || '').replace(/\/$/, '');
  const token = env.FEEDBACK_TOKEN || readJson(join(root, '.atelier', 'secrets.json'))?.FEEDBACK_TOKEN;
  if (!url) throw new Error(`서비스 주소가 없어요 — company/${id}/service.json 의 url`);
  if (!token) throw new Error('의견을 가져올 열쇠(FEEDBACK_TOKEN)가 없어요 — npm run deploy:first 를 한 번 실행하면 만들어져요');
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const res = await fetchImpl(`${url}/api/feedback`, { headers: auth });
  if (res.status === 401) throw new Error('서비스가 열쇠를 거절했어요 — npm run deploy:first 를 다시 실행해 열쇠를 맞춰 주세요');
  if (!res.ok) throw new Error(`의견 조회 실패: HTTP ${res.status}`);
  const { items = [] } = await res.json();
  if (!items.length) { log('새 의견 없음'); return { added: 0 }; }
  const date = now.toISOString().slice(0, 10);
  const file = join(root, 'company', id, 'feedback', `${date}.json`);
  const { doc, added } = merge(readJson(file), items, date);
  writeJson(file, doc); // 파일에 먼저 쓰고 나서 ack — 실패하면 다음에 다시 가져온다 (중복은 merge 가 거른다)
  const upTo = Math.max(...items.map((i) => i.id));
  const ack = await fetchImpl(`${url}/api/feedback/ack`, { method: 'POST', headers: auth, body: JSON.stringify({ upTo }) });
  if (!ack.ok) throw new Error(`표시(ack) 실패: HTTP ${ack.status} — 의견은 저장됨, 다음에 다시 시도`);
  log(`새 의견 ${added}건 → company/${id}/feedback/${date}.json`);
  return { added, file };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pull({ service: process.argv[2] }).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
