#!/usr/bin/env node
// 클라우드 본부 공통 절차(playbook/*)를 스킬 문서에서 만든다 — 손으로 옮겨 적다 생기는 어긋남을 없앤다.
//   node playbook.mjs build <출력폴더>          → <출력폴더>/playbook/<이름>.json + writes.json(ArtifactData batch 용)
//   node playbook.mjs check <내려받은 폴더>      → 본부에 있는 것과 스킬 문서를 비교해 달라진 이름만 출력 (없으면 0 종료)
// 문서마다 source(원본 경로)·hash(내용 지문)·atelier(플러그인 버전)를 함께 적어, 다음에 무엇이 낡았는지 바로 안다.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = 'Mode1221/Atelier-dev';

// 본부 이름 → 스킬 안 원본
export function sources(root = SKILLS) {
  const map = {
    'cloud-run': 'company/references/cloud-run.md',
    planning: 'company/references/planning.md',
    stages: 'pilot/SKILL.md',
    channels: 'share/references/channel-guide.md',
    'dept-prompt': 'company/cloud/dept-prompt.md', // 본부에서 부서를 새로 세우거나 지시문을 고칠 때 채우는 틀
  };
  for (const f of readdirSync(join(root, 'company/references/departments')).filter((x) => x.endsWith('.md')).sort()) {
    map[`dept-${f.slice(0, -3)}`] = `company/references/departments/${f}`;
  }
  return map;
}

export const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

export function build(root = SKILLS) {
  let version = '';
  try { version = JSON.parse(readFileSync(join(root, '../.claude-plugin/plugin.json'), 'utf8')).version; } catch { /* 버전 없이도 동작 */ }
  return Object.entries(sources(root)).map(([name, rel]) => {
    const text = readFileSync(join(root, rel), 'utf8');
    return { name, doc: { source: `${REPO} skills/${rel}`, text, hash: hash(text), atelier: version } };
  });
}

// 본부 쪽 문서(내려받은 JSON)와 비교: 없음·내용 다름을 돌려준다. hash 가 없던 옛 문서는 text 로 비교한다.
export function diff(built, remote) {
  const out = [];
  for (const { name, doc } of built) {
    const r = remote[name];
    if (!r) out.push({ name, why: '본부에 없음' });
    else if ((r.hash ?? hash(r.text ?? '')) !== doc.hash) out.push({ name, why: '스킬 문서와 다름' });
  }
  return out;
}

function readRemote(dir) {
  const base = existsSync(join(dir, 'playbook')) ? join(dir, 'playbook') : dir;
  const out = {};
  if (!existsSync(base)) return out;
  for (const f of readdirSync(base).filter((x) => x.endsWith('.json'))) {
    try { out[f.slice(0, -5)] = JSON.parse(readFileSync(join(base, f), 'utf8')); } catch { /* 깨진 파일은 없는 것으로 */ }
  }
  return out;
}

export function cli(argv, log = console.log) {
  const [cmd, dir] = argv;
  if (cmd === 'build' && dir) {
    const docs = build();
    mkdirSync(join(dir, 'playbook'), { recursive: true });
    const writes = docs.map(({ name, doc }) => {
      const file = resolve(dir, 'playbook', `${name}.json`);
      writeFileSync(file, JSON.stringify(doc, null, 2));
      return { op: 'set', collection: 'playbook', doc_id: name, file_path: file };
    });
    writeFileSync(join(dir, 'writes.json'), JSON.stringify(writes, null, 2));
    log(`${docs.length}개 → ${join(dir, 'writes.json')} (ArtifactData batch 의 writes 로; 이미 있는 문서는 if_version 을 붙인다)`);
    return 0;
  }
  if (cmd === 'check' && dir) {
    const d = diff(build(), readRemote(dir));
    if (!d.length) { log('본부 절차가 스킬 문서와 같아요.'); return 0; }
    for (const x of d) log(`낡음: playbook/${x.name} — ${x.why}`);
    return 1;
  }
  log('사용법: node playbook.mjs build <출력폴더> | check <내려받은 폴더>');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(cli(process.argv.slice(2)));
