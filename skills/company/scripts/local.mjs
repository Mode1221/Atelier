#!/usr/bin/env node
// Atelier company — 로컬 모드 본부 (프로젝트 폴더의 company/<SERVICE>/ 파일). 의존성 없음.
// 데이터 형식·id·시각 규칙은 references/cloud-run.md 1절과 같다. 이 스크립트는 규칙이 정해진 읽기·쓰기만 한다
// (브리핑, 결재 반영, 할 일 체크, 부서 켜기·끄기, 실행 순서, 형식 검사). 부서 업무 자체는 Claude 가 local-run.md 대로 한다.
//
// 사용 (프로젝트 폴더에서):
//   node local.mjs init <서비스ID> --name 이름 [--url 주소] [--summary 한줄] [--audience 대상] [--kind 웹] [--stage 단계]
//   node local.mjs services
//   node local.mjs brief [서비스ID] [--json]
//   node local.mjs decide [서비스ID] <번호|id> approve|reject [이유…]  ("1번 승인" / "2번 반려: 이유")
//   node local.mjs human-done [서비스ID] <번호>
//   node local.mjs enable|disable [서비스ID] <부서>
//   node local.mjs order [서비스ID] <부서|all>
//   node local.mjs check [서비스ID]
//   node local.mjs now
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const DEPTS = {
  ceo: '대표실', plan: '기획', design: '디자인', dev: '개발', qa: 'QA',
  security: '보안·법무', marketing: '마케팅', support: '고객지원', ops: '운영', data: '데이터·재무',
};
export const DEFAULT_ENABLED = ['ceo', 'support', 'marketing'];
export const COLLECTIONS = ['approvals', 'tasks', 'human', 'reports', 'feedback', 'plan', 'metrics', 'share', 'shared'];
export const CHANNEL_IDS = ['everytime', 'kakaotalk', 'threads', 'x', 'bluesky', 'facebook', 'linkedin', 'reddit', 'band', 'naver_blog', 'naver_cafe', 'daangn', 'disquiet', 'instagram', 'discord'];

const SERVICE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DOC_ID = /^[a-z0-9][a-z0-9_.-]{0,99}$/i;
// approvals·tasks·human: <부서>-<YYYYMMDD>-<짧은이름>
export const WORK_ID = new RegExp(`^(${Object.keys(DEPTS).join('|')})-\\d{8}-[a-z0-9-]+$`);

// `date -u +%FT%TZ` 와 같은 형식
export const now = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const workId = (dept, slug, d = new Date()) => `${dept}-${now(d).slice(0, 10).replace(/-/g, '')}-${slug}`;

export function serviceDir(root, service) {
  if (!SERVICE_ID.test(service ?? '')) throw new Error(`서비스 ID 는 영문 소문자·숫자·- 만 (받은 값: "${service}")`);
  return join(root, 'company', service);
}

// company/<서비스>/ 밖으로 나가는 경로는 거절한다
export function docPath(root, service, collection, id) {
  const base = serviceDir(root, service);
  if (collection === null) return join(base, 'service.json');
  if (!COLLECTIONS.includes(collection)) throw new Error(`모르는 컬렉션 "${collection}"`);
  if (!DOC_ID.test(id ?? '')) throw new Error(`문서 id 형식이 아니에요: "${id}"`);
  const p = resolve(base, collection, `${id}.json`);
  if (!p.startsWith(resolve(base) + sep)) throw new Error('서비스 폴더 밖 경로');
  return p;
}

export function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`${p}: JSON 을 읽을 수 없어요 (${e.message})`); }
}
// 반쯤 쓴 파일이 남지 않게 임시 파일에 쓰고 바꿔치기
export function writeJson(p, data) {
  mkdirSync(resolve(p, '..'), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, p);
  return data;
}

export const read = (root, service, collection, id) => readJson(docPath(root, service, collection, id));
export const write = (root, service, collection, id, data) => writeJson(docPath(root, service, collection, id), data);
export function list(root, service, collection) {
  const dir = join(serviceDir(root, service), collection);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ id: f.slice(0, -5), ...readJson(join(dir, f)) }));
}

export function services(root) {
  const dir = join(root, 'company');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SERVICE_ID.test(d.name) && existsSync(join(dir, d.name, 'service.json')))
    .map((d) => ({ id: d.name, ...readJson(join(dir, d.name, 'service.json')) }));
}

// 서비스 ID 를 안 적었으면: 하나뿐일 때 그걸 쓴다
export function pickService(root, given) {
  if (given) return given;
  const all = services(root);
  if (all.length === 1) return all[0].id;
  throw new Error(all.length ? `서비스가 여럿이에요 — 서비스 ID 를 적어 주세요: ${all.map((s) => s.id).join(', ')}` : '아직 회사가 없어요 — /atelier:company setup');
}

export function init(root, service, fields = {}, at = new Date()) {
  const p = docPath(root, service, null);
  const old = readJson(p) ?? {};
  const doc = {
    name: service, summary: '', audience: '', kind: '웹', url: '', stage: '', repo: null, project: '.',
    done: [], cautions: [], existing: [], enabled: [...DEFAULT_ENABLED], createdAt: now(at),
    ...old,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')),
  };
  for (const c of ['approvals', 'tasks', 'human', 'reports', 'feedback', 'plan', 'metrics', 'share']) mkdirSync(join(serviceDir(root, service), c), { recursive: true });
  return writeJson(p, doc);
}

// 결재 대기 — 번호는 올라온 순서(createdAt, 같으면 id). 브리핑과 decide 가 같은 번호를 쓴다.
export function pending(root, service) {
  return list(root, service, 'approvals').filter((a) => a.status === 'pending')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
}
export function openHuman(root, service) {
  return list(root, service, 'human').filter((h) => !h.done)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
}

// 번호(브리핑 목록 기준) 또는 문서 id 로 고른다. 한 번에 여러 건을 결정하면 번호가 당겨지므로 id 를 쓴다.
const pickItem = (items, key) => (/^\d+$/.test(String(key)) ? items[Number(key) - 1] : items.find((x) => x.id === key));

export function decide(root, service, n, verdict, reason = '', at = new Date()) {
  const a = pickItem(pending(root, service), n);
  if (!a) throw new Error(`${/^\d+$/.test(String(n)) ? `${n}번` : `"${n}"`} 결재가 없어요 (대기 ${pending(root, service).length}건)`);
  if (!['approve', 'reject'].includes(verdict)) throw new Error('approve 또는 reject');
  if (verdict === 'reject' && !reason.trim()) throw new Error('반려는 이유가 필요해요 — 예: "2번 반려: 문구가 과장돼요"');
  const { id, ...doc } = a;
  const next = { ...doc, status: verdict === 'approve' ? 'approved' : 'rejected', decidedAt: now(at), ...(reason.trim() ? { reason: reason.trim() } : {}) };
  write(root, service, 'approvals', id, next);
  const who = DEPTS[a.dept] ?? a.dept;
  return verdict === 'approve'
    ? `승인했어요: ${a.title}\n→ ${a.ifApprove || '승인한 대로 진행해요'} (${who} 부서가 다음 실행 때 진행)`
    : `반려했어요: ${a.title}\n이유: ${reason.trim()}\n→ ${a.ifReject || '진행하지 않아요'} (${who} 부서가 이유를 반영해 고치거나 다시 올려요)`;
}

export function humanDone(root, service, n, at = new Date()) {
  const h = pickItem(openHuman(root, service), n);
  if (!h) throw new Error(`${n}번 할 일이 없어요`);
  const { id, ...doc } = h;
  write(root, service, 'human', id, { ...doc, done: true, doneAt: now(at) });
  return `완료로 바꿨어요: ${h.text}`;
}

export function setEnabled(root, service, dept, on) {
  if (!DEPTS[dept]) throw new Error(`모르는 부서 "${dept}" (가능: ${Object.keys(DEPTS).join(', ')})`);
  const svc = read(root, service, null);
  if (!svc) throw new Error(`서비스 "${service}" 가 없어요`);
  const set = new Set(svc.enabled ?? DEFAULT_ENABLED);
  if (on) set.add(dept); else set.delete(dept);
  svc.enabled = Object.keys(DEPTS).filter((d) => set.has(d));
  write(root, service, null, null, svc);
  return `${DEPTS[dept]} 부서를 ${on ? '켰어요 — 실행할 때마다 Claude 사용량이 들어요' : '껐어요'}. 켜진 부서: ${svc.enabled.map((d) => DEPTS[d]).join(', ') || '없음'}`;
}

// all → 켜 둔 부서를 대표실 먼저, 나머지는 DEPTS 순서로
export function runOrder(root, service, what) {
  const enabled = read(root, service, null)?.enabled ?? DEFAULT_ENABLED;
  if (what !== 'all') {
    if (!DEPTS[what]) throw new Error(`모르는 부서 "${what}"`);
    return [what];
  }
  return Object.keys(DEPTS).filter((d) => enabled.includes(d));
}

export function brief(root, service, at = new Date()) {
  const svc = read(root, service, null) ?? {};
  const reports = Object.fromEntries(list(root, service, 'reports').map((r) => [r.id, r]));
  const road = read(root, service, 'plan', 'roadmap');
  const tasks = list(root, service, 'tasks');
  return {
    service, name: svc.name ?? service, date: now(at).slice(0, 10), url: svc.url || null,
    today: reports.ceo?.summary ?? null,
    focus: road?.focus ?? null,
    goals: (road?.goals ?? []).map((g) => ({ text: g.text, current: g.current ?? null, target: g.target ?? null, unit: g.unit ?? '' })),
    approvals: pending(root, service).map((a, i) => ({ n: i + 1, id: a.id, dept: a.dept, kind: a.kind, title: a.title, cost: a.cost ?? null, ifApprove: a.ifApprove ?? '', ifReject: a.ifReject ?? '' })),
    human: openHuman(root, service).map((h, i) => ({ n: i + 1, id: h.id, text: h.text, why: h.why ?? '', link: h.link ?? '' })),
    depts: Object.keys(DEPTS).map((d) => ({
      id: d, name: DEPTS[d], on: (svc.enabled ?? DEFAULT_ENABLED).includes(d),
      open: tasks.filter((t) => t.dept === d && ['todo', 'doing', 'review'].includes(t.status)).length,
      level: reports[d]?.level ?? null, summary: reports[d]?.summary ?? null, at: reports[d]?.at ?? null,
    })),
  };
}

const LEVEL = { good: '🟢', warning: '🟡', critical: '🔴' };
export function briefText(b) {
  const out = [`■ ${b.name} — ${b.date} 브리핑${b.url ? ` (${b.url})` : ''}`];
  out.push(`오늘: ${b.today ?? '대표실이 아직 일하지 않았어요 — "/atelier:company run ceo"'}`);
  if (b.focus) out.push(`이번 목표: ${b.focus}`);
  for (const g of b.goals) out.push(`  · ${g.text}: ${g.current ?? '측정 없음'}${g.target != null ? ` / ${g.target}${g.unit}` : ''}`);
  out.push('', `결재 대기 ${b.approvals.length}건${b.approvals.length ? ' — "1번 승인" 또는 "1번 반려: 이유" 로 답해 주세요' : ''}`);
  for (const a of b.approvals) {
    out.push(`  ${a.n}. [${DEPTS[a.dept] ?? a.dept}·${a.kind ?? '결재'}] ${a.title}${a.cost ? ` (비용 ${a.cost})` : ''}`);
    if (a.ifApprove) out.push(`     승인하면: ${a.ifApprove}`);
    if (a.ifReject) out.push(`     반려하면: ${a.ifReject}`);
  }
  out.push('', `대표 할 일 ${b.human.length}건${b.human.length ? ' — 끝나면 "할 일 1 완료"' : ''}`);
  for (const h of b.human) out.push(`  ${h.n}. ${h.text}${h.why ? ` — ${h.why}` : ''}${h.link ? ` (${h.link})` : ''}`);
  out.push('', '부서');
  for (const d of b.depts) {
    if (!d.on && !d.summary && !d.open) continue;
    out.push(`  ${d.on ? '●' : '○'} ${d.name}${d.on ? '' : ' (꺼짐)'}${d.open ? ` · 할 일 ${d.open}` : ''}${d.summary ? ` · ${LEVEL[d.level] ?? ''} ${d.summary}` : d.on ? ' · 아직 보고 없음' : ''}`);
  }
  const idle = b.depts.filter((d) => !d.on && d.open).map((d) => d.name);
  if (idle.length) out.push(`  ⚠ 꺼진 부서에 할 일이 있어요: ${idle.join(', ')} — "○○ 부서 켜 줘"`);
  return out.join('\n');
}

// 형식 검사: id 규칙, 상태 값, 채널 ID, 홍보 글 본문 링크
export function check(root, service) {
  const problems = [];
  const svc = read(root, service, null);
  if (!svc) return [`service.json 이 없어요`];
  for (const d of svc.enabled ?? []) if (!DEPTS[d]) problems.push(`service.json enabled: 모르는 부서 "${d}"`);
  const st = { approvals: ['pending', 'approved', 'rejected'], tasks: ['todo', 'doing', 'review', 'done'] };
  for (const c of ['approvals', 'tasks', 'human']) {
    for (const x of list(root, service, c)) {
      if (!WORK_ID.test(x.id)) problems.push(`${c}/${x.id}: id 는 <부서>-<YYYYMMDD>-<짧은이름>`);
      if (st[c] && !st[c].includes(x.status)) problems.push(`${c}/${x.id}: status "${x.status}"`);
      if (x.dept && !DEPTS[x.dept] && x.dept !== 'human') problems.push(`${c}/${x.id}: 모르는 부서 "${x.dept}"`);
      for (const k of ['createdAt', 'updatedAt', 'decidedAt']) if (x[k] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x[k])) problems.push(`${c}/${x.id}: ${k} 는 date -u +%FT%TZ 형식`);
    }
  }
  for (const r of list(root, service, 'reports')) if (!['good', 'warning', 'critical'].includes(r.level)) problems.push(`reports/${r.id}: level "${r.level}"`);
  const posts = read(root, service, 'share', 'posts');
  for (const [i, p] of (posts?.posts ?? []).entries()) {
    if (!CHANNEL_IDS.includes(p.channel)) problems.push(`share/posts ${i + 1}번: channel 은 ID (받은 값 "${p.channel}")`);
    if (/https?:\/\//.test(p.text ?? '')) problems.push(`share/posts ${i + 1}번: 본문에 링크를 넣지 않아요 (올릴 때 자동으로 붙음)`);
  }
  return problems;
}

// --- 명령줄
function parseFlags(args) {
  const flags = {}; const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { const k = args[i].slice(2); flags[k] = args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[++i]; } else rest.push(args[i]);
  }
  return { flags, rest };
}
// 첫 인자가 서비스 ID 로 보이고 실제로 있으면 서비스, 아니면 생략된 것으로 본다
function svcArg(root, rest) {
  if (rest[0] && SERVICE_ID.test(rest[0]) && existsSync(join(root, 'company', rest[0], 'service.json'))) return [rest[0], rest.slice(1)];
  return [pickService(root), rest];
}

export function cli(argv, root = process.cwd()) {
  const [cmd, ...args] = argv;
  const { flags, rest } = parseFlags(args);
  switch (cmd) {
    case 'now': return now();
    case 'init': {
      const [id] = rest;
      const doc = init(root, id, { name: flags.name, url: flags.url, summary: flags.summary, audience: flags.audience, kind: flags.kind, stage: flags.stage });
      return `회사를 세웠어요: company/${id}/ (켜진 부서: ${doc.enabled.map((d) => DEPTS[d]).join(', ')} — 실행할 때마다 Claude 사용량이 들어요)`;
    }
    case 'services': return services(root).map((s) => `${s.id}\t${s.name}\t${s.stage ?? ''}`).join('\n') || '(없음)';
    case 'brief': { const [s] = svcArg(root, rest); const b = brief(root, s); return flags.json ? JSON.stringify(b, null, 2) : briefText(b); }
    case 'decide': { const [s, [n, v, ...why]] = svcArg(root, rest); return decide(root, s, n, v, why.join(' ')); }
    case 'human-done': { const [s, [n]] = svcArg(root, rest); return humanDone(root, s, n); }
    case 'enable': case 'disable': { const [s, [d]] = svcArg(root, rest); return setEnabled(root, s, d, cmd === 'enable'); }
    case 'order': { const [s, [w]] = svcArg(root, rest); return runOrder(root, s, w ?? 'all').join(' '); }
    case 'check': { const [s] = svcArg(root, rest); const p = check(root, s); if (p.length) { const e = new Error(p.map((x) => `✗ ${x}`).join('\n')); e.check = true; throw e; } return '형식 이상 없음'; }
    default: throw new Error('명령: init | services | brief | decide | human-done | enable | disable | order | check | now');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(cli(process.argv.slice(2))); } catch (e) { console.error(e.check ? e.message : `✗ ${e.message}`); process.exit(1); }
}
