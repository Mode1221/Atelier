#!/usr/bin/env node
// Atelier beta — GitHub 없이 베타 의견 가져오기 (AI 회사 로컬 모드).
// 서비스의 "의견 보내기"에 쌓인 것을 company/<서비스>/feedback/<날짜>.json 에 모으고, 옮긴 것까지 서비스에 표시(ack)한다.
// 서비스 계약은 feedback-sync.mjs 와 같다 (references/feedback-contract.md).
// 주소: company/<서비스>/service.json 의 url (또는 SERVICE_URL). 토큰: .atelier/secrets.json 의 FEEDBACK_TOKEN
//   (npm run deploy:first 가 만들어 둔다 — .dev.vars.example 에 FEEDBACK_TOKEN=auto) 또는 환경변수 FEEDBACK_TOKEN.
// 사용 (프로젝트 폴더에서): node scripts/feedback-pull.mjs [서비스ID]
// 클라우드 본부 연결: node scripts/feedback-pull.mjs --cloud [서비스ID] → 열쇠 확인 + 클립보드 복사 + 붙여 넣을 곳 안내 (값은 화면에 안 나옴)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const writeJson = (p, d) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(`${p}.tmp`, `${JSON.stringify(d, null, 2)}\n`); renameSync(`${p}.tmp`, p); };

export function pickService(root, given) {
  if (given) return given;
  const dir = join(root, 'company');
  const ids = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'service.json'))) : [];
  if (ids.length === 1) return ids[0];
  throw new Error(ids.length ? `서비스 ID 를 적어 주세요: ${ids.join(', ')}` : 'company/ 가 없어요 — /atelier-dev:company setup');
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

// 클립보드에 넣기 — 운영체제마다 다른 명령. 없으면 false
export function copyToClipboard(text, { platform = process.platform, spawn = spawnSync } = {}) {
  const cmds = platform === 'darwin' ? [['pbcopy']] : platform === 'win32' ? [['clip']] : [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '-b', '-i']];
  for (const [cmd, ...args] of cmds) { const r = spawn(cmd, args, { input: text }); if (r.status === 0) return true; }
  return false;
}

// 클라우드 본부(루틴)가 의견을 가져오게 연결 — 사람은 "붙여 넣기" 한 번만
export async function connectCloud({ root = process.cwd(), service, env = process.env, fetchImpl = fetch, copy = copyToClipboard, log = console.log } = {}) {
  const id = pickService(root, service);
  const svc = readJson(join(root, 'company', id, 'service.json')) ?? {};
  const url = (env.SERVICE_URL || svc.url || '').replace(/\/$/, '');
  const token = env.FEEDBACK_TOKEN || readJson(join(root, '.atelier', 'secrets.json'))?.FEEDBACK_TOKEN;
  if (!url) throw new Error(`서비스 주소가 없어요 — company/${id}/service.json 의 url`);
  if (!token) throw new Error('열쇠(FEEDBACK_TOKEN)가 없어요 — npm run deploy:first 를 한 번 실행하면 만들어져요');
  const res = await fetchImpl(`${url}/api/feedback`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(res.status === 401 ? '서비스가 열쇠를 거절했어요 — npm run deploy:first 를 다시 실행해 맞춘 뒤 다시' : `서비스 확인 실패: HTTP ${res.status}`);
  const name = `FEEDBACK_TOKEN_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const copied = copy(token);
  const host = new URL(url).host;
  log(`✅ 열쇠가 서비스와 맞아요.${copied ? ' 열쇠를 클립보드에 복사했어요 (화면엔 안 보여요).' : ''}`);
  log(`\n대표가 할 일 (1분, claude.ai):\n 1. 본부 루틴이 도는 클라우드 환경 → 편집(Edit) → 환경변수에 새 줄: ${name}=${copied ? '<붙여 넣기>' : '<.atelier/secrets.json 의 FEEDBACK_TOKEN 값>'}\n 2. 같은 화면 네트워크 허용 도메인에 ${host} (막혀 있으면)\n 3. 채팅에는 붙여 넣지 않기`);
  const feedback = { url: `${url}/api/feedback`, env: name };
  log(`\n서비스 문서(companies/${id})에 적을 값: ${JSON.stringify({ feedback })}`);
  return { name, host, copied, feedback };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--cloud') connectCloud({ service: args[1] }).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
  else pull({ service: args[0] }).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
