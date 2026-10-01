#!/usr/bin/env node
// Atelier 0.28.0 의 skills/guard/scripts/secret-scan.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
// Atelier guard — 비밀값 유출 검사 (의존성 없음). 저장소에 올라가는 파일에서 키·토큰·개인키 모양을 찾는다.
// 찾으면: 파일에서 지우는 것만으로는 부족하다 — 이미 올라갔다면 그 키를 **폐기·재발급**한다 (guard G1).
// 사용: node <atelier>/skills/guard/scripts/secret-scan.mjs [폴더] [--json]   · 찾으면 종료 코드 1
// 예외: 그 줄에 `secret-scan: ignore` 주석 (가짜 값·테스트용일 때만, 이유와 함께)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles } from './lib.mjs';
import { pathToFileURL } from 'node:url';

export const RULES = [
  ['AWS 액세스 키', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub 토큰', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['Slack 토큰', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe 운영 키', /\b[rs]k_live_[0-9a-zA-Z]{20,}/],
  ['Google API 키', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Anthropic·OpenAI 키', /\bsk-(?:ant-[A-Za-z0-9_-]{20,}|proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{40,})/],
  ['개인키', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['JWT (Supabase service_role 등)', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
];
const ASSIGN = /\b(?:secret|token|api[_-]?key|apikey|password|passwd|private[_-]?key|access[_-]?key|client[_-]?secret)\w*\s*[:=]\s*['"]([^'"\s]{20,})['"]/i;
const PLACEHOLDER = /example|your|xxx|placeholder|changeme|dummy|sample|test|fake|auto|<|\$\{|process\.env|env\./i;
const SKIP_FILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|.*\.min\.js|.*\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf|mp4|bundle))$/;

export function entropy(s) {
  const f = {};
  for (const c of s) f[c] = (f[c] ?? 0) + 1;
  return -Object.values(f).reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0);
}

export function scanText(text, file = '') {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes('secret-scan: ignore')) return;
    for (const [kind, re] of RULES) if (re.test(line)) hits.push({ file, line: i + 1, kind });
    const m = line.match(ASSIGN);
    if (m && !PLACEHOLDER.test(m[1]) && /\d/.test(m[1]) && /[A-Za-z]/.test(m[1]) && entropy(m[1]) > 3.5 && !hits.some((h) => h.line === i + 1)) hits.push({ file, line: i + 1, kind: '비밀값처럼 보이는 값' });
  });
  return hits;
}

function tracked(root) {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return listFiles(root);
  }
}

export function scan(root) {
  const files = tracked(root);
  const hits = [];
  for (const f of files) {
    if (/(^|\/)(\.env|\.dev\.vars)$/.test(f)) hits.push({ file: f, line: 0, kind: '비밀값 파일이 저장소에 올라감 (.gitignore 에 넣고 기록에서 빼기)' });
    if (SKIP_FILE.test(f)) continue;
    let text;
    try {
      text = readFileSync(join(root, f), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue; // 이진 파일
    hits.push(...scanText(text, f));
  }
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  const hits = scan(root);
  if (args.includes('--json')) console.log(JSON.stringify(hits, null, 2));
  else if (!hits.length) console.log('✓ 비밀값처럼 보이는 것 없음');
  else {
    for (const h of hits) console.log(`✗ ${h.file}${h.line ? `:${h.line}` : ''} — ${h.kind}`);
    console.log('\n값을 지우고, 이미 올라간 적이 있으면 그 키를 폐기·재발급하세요. 가짜 값이면 그 줄에 `secret-scan: ignore` 와 이유를 적으세요.');
  }
  process.exit(hits.length ? 1 : 0);
}
