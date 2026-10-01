#!/usr/bin/env node
// Atelier — 막혔을 때 진단. 개발을 몰라도 "무슨 일인지·어떻게 고치는지·누가 하는지"를 한국어로.
//   npm run doctor                      # 이 프로젝트 준비 상태 점검 (Node·설치·설정·비밀값·git)
//   npm run doctor -- --explain 로그.txt # 오류 메시지 풀이 (파일 대신 파이프도 됨: 명령 2>&1 | npm run doctor -- --explain)
// deploy-first.mjs 가 실패하면 자동으로 explain 을 부른다. 모르는 오류면 마지막 줄들을 AI 에게 보여 주라고 안내한다.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// by: AI = Claude 에게 "고쳐 줘"라고 하면 됨 · 사람 = 계정·결제·버튼처럼 사람만 할 수 있음
export const KNOWN = [
  // 로그인·계정
  { id: 'cf-login', re: /not authenticated|You are not logged in|wrangler login|Authentication error \[code: 10000\]|Invalid access token/i, title: 'Cloudflare 로그인이 풀렸어요', fix: '`npx wrangler login` 을 실행하고 브라우저에서 "허용"을 누른 뒤 다시 실행', by: '사람' },
  { id: 'cf-subdomain', re: /workers\.dev subdomain|register a workers\.dev/i, title: 'workers.dev 주소를 아직 안 정했어요', fix: 'Cloudflare 대시보드 → Workers 에서 하위 주소(예: 내이름.workers.dev)를 한 번 정하고 다시 실행', by: '사람' },
  { id: 'cf-account', re: /More than one account available|account_id|code: 7003|Could not route to/i, title: 'Cloudflare 계정을 고르지 못했어요', fix: 'wrangler.toml 에 `account_id = "..."`(대시보드 오른쪽 아래 계정 ID)를 넣거나, 계정이 여럿이면 쓸 계정을 정해 AI 에게 알려 주기', by: '사람' },
  { id: 'cf-r2', re: /(enable|purchas|subscri).*R2|R2.*(enable|purchas|subscri)/i, title: '파일 저장소(R2)를 아직 켜지 않았어요', fix: 'Cloudflare 대시보드 → R2 → "사용 시작"(무료 한도 안이면 0원) 후 다시 실행', by: '사람' },
  { id: 'cf-rate', re: /Too Many Requests|\b429\b|rate limit/i, title: '요청이 너무 잦아요', fix: '1~2분 뒤 다시 실행', by: '사람' },
  // 설정·코드
  { id: 'd1-missing', re: /Couldn'?t find a D1 DB|no database_id|database_id.*(missing|required)/i, title: 'DB 설정이 비어 있어요', fix: '`npm run deploy:first` 를 실행하면 DB 를 만들고 wrangler.toml 에 적어 줘요', by: '사람' },
  { id: 'no-table', re: /no such table|no such column/i, title: '운영 DB 에 표가 아직 없어요 (마이그레이션 안 됨)', fix: '`npx wrangler d1 migrations apply DB --remote` (DB 는 wrangler.toml 의 binding) — 또는 `npm run deploy:first`', by: 'AI' },
  { id: 'dup-column', re: /duplicate column name|table \S+ already exists/i, title: '이미 적용된 DB 변경을 또 하려고 해요', fix: '적용된 마이그레이션 파일은 고치지 말고, 바꿀 내용은 새 번호 파일로 — AI 에게 "마이그레이션 충돌 고쳐 줘"', by: 'AI' },
  { id: 'unique', re: /UNIQUE constraint failed/i, title: '같은 값이 이미 있어요', fix: '중복 저장을 막는 코드(있으면 갱신)로 — AI 에게 이 메시지 그대로 보여 주기', by: 'AI' },
  { id: 'resolve', re: /Could not resolve "([^"]+)"|Cannot find (module|package) '([^']+)'|Unable to resolve module/i, title: '필요한 부품(패키지)이 설치되지 않았어요', fix: '`npm install` 후 다시. 그래도 같으면 AI 에게 "패키지 설치해 줘"(앱은 `npx expo install <이름>`)', by: 'AI' },
  { id: 'export', re: /No matching export|does not provide an export named|is not exported by/i, title: '코드에서 없는 이름을 가져다 쓰고 있어요', fix: 'AI 에게 이 메시지를 보여 주고 "고쳐 줘"', by: 'AI' },
  { id: 'syntax', re: /SyntaxError|Unexpected token|Expected ".*" but found/i, title: '코드에 문법 오류가 있어요', fix: 'AI 에게 이 메시지를 보여 주고 "고쳐 줘" (최근에 바꾼 파일부터)', by: 'AI' },
  { id: 'size', re: /exceeds? (the )?(size )?limit|Worker size|script too large/i, title: '서버 코드가 너무 커요 (무료 한도 넘음)', fix: '큰 라이브러리를 빼거나 가벼운 것으로 — AI 에게 "Worker 용량 줄여 줘"', by: 'AI' },
  { id: 'cpu', re: /exceeded (the )?CPU|Script startup exceeded/i, title: '서버가 시작할 때 일을 너무 많이 해요', fix: '무거운 준비 작업을 요청 때로 미루기 — AI 에게 이 메시지를 보여 주기', by: 'AI' },
  { id: 'compat', re: /compatibility[_ ]date.*(future|in the future)|Can't set compatibility date in the future/i, title: '설정 날짜가 미래로 돼 있어요', fix: 'wrangler.toml 의 compatibility_date 를 오늘 이전 날짜로', by: 'AI' },
  { id: 'do-migration', re: /new-class migration|Durable Object.*migration|migrations are required/i, title: '실시간 방(Durable Object) 등록이 빠졌어요', fix: 'wrangler.toml 에 `[[migrations]] tag = "v1" new_sqlite_classes = ["Room"]` 추가 (realtime 템플릿 README)', by: 'AI' },
  { id: 'secret', re: /env\.[A-Z_]+ is undefined|Missing (secret|binding)|binding .* not found/i, title: '비밀값·연결 설정이 빠졌어요', fix: '`npm run deploy:first` 를 다시 실행하면 빠진 비밀값을 물어봐요 (로컬은 .dev.vars)', by: '사람' },
  // 내 컴퓨터
  { id: 'node-missing', re: /(node|npx|npm): (command )?not found|'(node|npx|npm)' is not recognized/i, title: 'Node.js 가 설치돼 있지 않아요', fix: 'https://nodejs.org 에서 LTS 버전 설치 → 터미널을 새로 열고 다시', by: '사람' },
  { id: 'node-old', re: /Unsupported engine|requires (at least )?Node(\.js)? v?(1[89]|2\d)|ERR_REQUIRE_ESM|node:sqlite/i, title: 'Node.js 버전이 낮아요', fix: 'https://nodejs.org 에서 최신 LTS 설치 후 다시', by: '사람' },
  { id: 'port', re: /EADDRINUSE|address already in use|port \d+ is (already )?in use/i, title: '이미 켜진 서버가 있어요', fix: '다른 터미널의 서버를 끄거나(Ctrl+C) 그대로 그 서버를 쓰기', by: '사람' },
  { id: 'network', re: /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|getaddrinfo|socket hang up/i, title: '인터넷 연결이 끊겼거나 막혔어요', fix: '와이파이·회사 보안망 확인 후 다시 (다시 실행해도 안전)', by: '사람' },
  { id: 'eacces', re: /EACCES|permission denied(?!.*publickey)/i, title: '파일·폴더 권한이 없어요', fix: '`sudo` 로 실행하지 말고 프로젝트를 내 폴더(문서·바탕화면 아래)로 옮겨서 다시', by: '사람' },
  { id: 'disk', re: /ENOSPC|no space left/i, title: '디스크가 가득 찼어요', fix: '안 쓰는 큰 파일을 지우고 다시', by: '사람' },
  // git·GitHub
  { id: 'git-auth', re: /Permission denied \(publickey\)|Authentication failed for|could not read Username|403.*github/i, title: 'GitHub 로그인이 안 돼 있어요', fix: '`gh auth login`(GitHub CLI) 또는 GitHub Desktop 으로 로그인 후 다시', by: '사람' },
  { id: 'git-behind', re: /\[rejected\].*(fetch first|non-fast-forward)|Updates were rejected/i, title: 'GitHub 에 더 새 변경이 있어요', fix: '`git pull --rebase` 후 다시 올리기 — 충돌이 나면 AI 에게 "충돌 풀어 줘"', by: 'AI' },
  // 앱 (Expo)
  { id: 'eas-login', re: /eas login|Not logged in.*Expo|You are not logged in to EAS/i, title: 'Expo 로그인이 필요해요', fix: '`npx eas login` (expo.dev 무료 가입)', by: '사람' },
  { id: 'apple-program', re: /Apple Developer Program|not a member of.*Apple|No team associated/i, title: 'Apple 개발자 프로그램 가입이 필요해요', fix: 'developer.apple.com 가입(연회비 있음, 승인 1~2일) — 그동안 안드로이드부터', by: '사람' },
  { id: 'versioncode', re: /versionCode.*already been used|bundle version must be higher|CFBundleVersion/i, title: '앱 버전 번호를 올려야 해요', fix: 'eas.json 의 `autoIncrement: true` 확인, 또는 app.json 버전 올리기', by: 'AI' },
  { id: 'expo-sdk', re: /expo doctor|incompatible with the installed expo|Some dependencies are incompatible/i, title: '앱 부품 버전이 서로 안 맞아요', fix: '`npx expo install --fix` 후 다시', by: 'AI' },
  // 기타 도구
  { id: 'playwright', re: /Executable doesn'?t exist|browserType\.launch|playwright install/i, title: '화면 검사용 브라우저가 없어요', fix: '`npx playwright install chromium`', by: 'AI' },
  { id: 'webkit', re: /webkit2gtk|javascriptcoregtk|libsoup/i, title: '데스크톱 앱 빌드 부품이 없어요 (리눅스)', fix: '`sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev` — 또는 GitHub 에서 빌드(desktop 템플릿 CI)', by: '사람' },
];

export function explain(text) {
  const s = String(text ?? '');
  const hits = KNOWN.filter((k) => k.re.test(s));
  return hits.length ? hits : null;
}

export function formatExplain(text, { tail = 15 } = {}) {
  const hits = explain(text);
  if (hits) return hits.map((h) => `● ${h.title}\n  어떻게: ${h.fix}\n  누가: ${h.by === '사람' ? '사람 (AI 가 대신 못 함)' : 'AI 에게 맡기면 됨'}`).join('\n');
  const last = String(text ?? '').trim().split(/\r?\n/).slice(-tail).join('\n');
  return `● 처음 보는 오류예요\n  어떻게: 아래 마지막 줄들을 그대로 AI 에게 보여 주고 "이 오류 고쳐 줘"\n  (비밀값·토큰이 보이면 그 부분은 지우고 보여 주세요)\n---\n${last}`;
}

// 프로젝트 준비 상태 — [{ ok, what, fix }]
export function checkup(root = '.', { node = process.versions.node, today = new Date() } = {}) {
  const has = (f) => existsSync(join(root, f));
  const read = (f) => (has(f) ? readFileSync(join(root, f), 'utf8') : '');
  const out = [];
  const add = (ok, what, fix) => out.push({ ok, what, fix });
  add(Number(node.split('.')[0]) >= 20, `Node.js ${node}`, 'nodejs.org 에서 LTS(20 이상) 설치');
  const pkg = read('package.json');
  add(!!pkg, 'package.json', 'AI 에게 "프로젝트 처음 만들기" — build B1');
  if (pkg) add(has('node_modules'), '패키지 설치(node_modules)', '`npm install`');
  const toml = read('wrangler.toml');
  if (toml) {
    const date = toml.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
    add(!date || new Date(date) <= today, `compatibility_date ${date ?? '(없음)'}`, '오늘 이전 날짜로');
    const empty = toml.split(/^\[\[d1_databases\]\]\s*$/m).slice(1).some((b) => !/^database_id\s*=\s*"[0-9a-f-]{36}"/m.test(b.split(/^\[/m)[0]));
    add(!empty, 'DB 연결(database_id)', '`npm run deploy:first` (처음 배포가 만들어 적어 줘요)');
    if (has('.dev.vars.example')) add(has('.dev.vars'), '로컬 실행용 비밀값(.dev.vars)', '`.dev.vars.example` 을 복사해 `.dev.vars` 로 — 값은 AI 가 테스트용으로 채워도 됨');
  }
  const gi = read('.gitignore');
  if (has('.dev.vars') || has('.atelier')) add(/\.dev\.vars/.test(gi) && (!has('.atelier') || /\.atelier/.test(gi)), '비밀값 파일이 git 에서 빠짐', '.gitignore 에 `.dev.vars` · `.atelier/` 추가');
  const inGit = (d) => existsSync(join(d, '.git')) || (dirname(d) !== d && inGit(dirname(d)));
  add(inGit(resolve(root)), 'git 저장소', '`git init` — 실수해도 되돌릴 수 있게');
  if (has('migrations')) {
    const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql'));
    const nums = files.map((f) => f.split('_')[0]);
    add(new Set(nums).size === nums.length, `마이그레이션 ${files.length}개 번호 중복 없음`, '번호가 같은 파일 이름을 바꾸기(이미 적용된 파일은 그대로)');
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--explain');
  if (i >= 0) {
    const file = args[i + 1];
    const text = file && existsSync(file) ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
    console.log(formatExplain(text));
  } else {
    const rows = checkup(args[0] ?? '.');
    for (const r of rows) console.log(`${r.ok ? '✅' : '❌'} ${r.what}${r.ok ? '' : `\n   → ${r.fix}`}`);
    const bad = rows.filter((r) => !r.ok).length;
    console.log(bad ? `\n고칠 것 ${bad}개 — 위 → 를 차례로` : '\n준비 완료');
    process.exit(bad ? 1 : 0);
  }
}
