#!/usr/bin/env node
// Atelier build — 모바일 앱(Expo) 첫 빌드를 명령 한 줄로. 휴대폰에 바로 설치할 수 있는 안드로이드 설치 파일(APK)을 만든다.
// Expo 로그인 확인 → 프로젝트 연결(eas init, 있으면 재사용) → eas.json 준비(미리보기=APK) → 클라우드 빌드 시작 → 빌드 페이지 주소 출력.
// 다시 실행해도 안전하다. 빌드는 Expo 무료 등급(대기열 있음, 보통 10~30분). iOS 는 Apple 개발자 계정(연 $99)이 필요해 따로 안내한다.
// 사용 (앱 폴더에서): npm run app:first    ("app:first": "node scripts/app-first.mjs")
// 사람 몫: expo.dev 무료 가입 + 이 명령 한 줄 (처음이면 로그인 질문에 답하기).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const EAS_JSON = {
  cli: { appVersionSource: 'remote' },
  build: {
    preview: { distribution: 'internal', android: { buildType: 'apk' } },
    production: { autoIncrement: true },
  },
};

// 이미 있는 eas.json 에 preview(APK) 프로필만 채운다 — 사용자가 고친 값은 그대로
export function ensureEasJson(text) {
  const cur = text ? JSON.parse(text) : {};
  const next = { ...EAS_JSON, ...cur, build: { ...EAS_JSON.build, ...(cur.build ?? {}) } };
  if (!cur.build?.preview) next.build.preview = EAS_JSON.build.preview;
  return `${JSON.stringify(next, null, 2)}\n`;
}

export const projectId = (appJsonText) => { try { return JSON.parse(appJsonText).expo?.extra?.eas?.projectId ?? null; } catch { return null; } };
export function buildUrl(jsonOut) {
  try { const b = [].concat(JSON.parse(jsonOut))[0]; return b?.buildDetailsPageUrl ?? (b?.id ? `https://expo.dev/builds/${b.id}` : null); } catch { return null; }
}

function eas(args, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['--yes', 'eas-cli@latest', ...args], { stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, EAS_NO_VCS: '1' }, shell: process.platform === 'win32' });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (!quiet) process.stdout.write(d); });
    p.on('close', (code) => resolve({ code, out }));
  });
}

export async function appFirst({ run = eas, log = console.log, dir = '.' } = {}) {
  const must = async (args, opts, what) => {
    const r = await run(args, opts);
    if (r.code !== 0) throw new Error(`${what} 실패 — 위 메시지를 확인하고 다시 실행하세요 (다시 실행해도 안전해요)`);
    return r;
  };
  if (!existsSync(`${dir}/app.json`)) throw new Error('app.json 이 없어요 — Expo 앱 폴더에서 실행해 주세요');

  log('1/4 Expo 로그인 확인');
  const who = await run(['whoami'], { quiet: true });
  if (who.code !== 0 || /not logged in/i.test(who.out)) {
    log('   로그인이 필요해요 — expo.dev 에서 무료로 가입한 이메일·비밀번호를 입력해 주세요');
    await must(['login'], {}, '로그인');
  }

  log('2/4 프로젝트 연결');
  if (projectId(readFileSync(`${dir}/app.json`, 'utf8'))) log('   이미 연결돼 있어요');
  else await must(['init', '--non-interactive', '--force'], {}, '프로젝트 연결');

  log('3/4 빌드 설정 (미리보기 = 휴대폰에 바로 설치하는 APK)');
  const easFile = `${dir}/eas.json`;
  writeFileSync(easFile, ensureEasJson(existsSync(easFile) ? readFileSync(easFile, 'utf8') : ''));

  log('4/4 클라우드 빌드 시작 (안드로이드)');
  const r = await must(['build', '--platform', 'android', '--profile', 'preview', '--non-interactive', '--no-wait', '--json'], { quiet: true }, '빌드 시작');
  const url = buildUrl(r.out);
  log(`\n✅ 빌드를 시작했어요 (보통 10~30분).${url ? `\n   진행·설치 페이지: ${url}` : ''}
   끝나면 그 페이지의 QR 코드를 안드로이드 휴대폰 카메라로 찍어 설치해요 ("출처를 알 수 없는 앱" 허용 필요).
   아이폰: Apple 개발자 계정(연 $99)이 필요해요 — 결정하면 "아이폰 빌드 도와줘" 라고 말해 주세요.`);
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  appFirst().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}
