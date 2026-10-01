#!/usr/bin/env node
// 봇 연결 도우미 — 배포 주소가 생긴 뒤 한 번.  node scripts/bot-setup.mjs <telegram|discord|kakao> https://<서비스 주소>
// 토큰은 .dev.vars 에서 읽는다(채팅에 붙여 넣지 않기). 값은 wrangler secret 에도 같은 이름으로 넣는다(npm run deploy:first 가 물어봄).
import { readFileSync, existsSync } from 'node:fs';
const vars = existsSync('.dev.vars') ? Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])) : {};
const [platform, base] = process.argv.slice(2);
if (!platform || !/^https:\/\//.test(base ?? '')) { console.log('사용: node bot-setup.mjs <telegram|discord|kakao> https://<서비스 주소>'); process.exit(1); }
if (platform === 'telegram') {
  // BotFather 에게 /newbot → 토큰을 .dev.vars 의 TELEGRAM_TOKEN 에. TELEGRAM_SECRET 은 아무 긴 무작위 값
  const r = await fetch(`https://api.telegram.org/bot${vars.TELEGRAM_TOKEN}/setWebhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${base}/bot/telegram`, secret_token: vars.TELEGRAM_SECRET, allowed_updates: ['message'] }) });
  console.log(r.ok ? '✓ 텔레그램 웹훅 연결' : `✗ ${r.status} ${await r.text()}`);
} else if (platform === 'discord') {
  // 개발자 포털 → 앱 → APPLICATION ID·PUBLIC KEY·봇 TOKEN 을 .dev.vars 에. Interactions Endpoint URL 칸에 아래 주소 붙여 넣기
  const r = await fetch(`https://discord.com/api/v10/applications/${vars.DISCORD_APP_ID}/commands`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bot ${vars.DISCORD_TOKEN}` }, body: JSON.stringify([{ name: 'ask', description: '봇에게 묻기', options: [{ type: 3, name: 'text', description: '내용', required: true }] }]) });
  console.log(r.ok ? `✓ /ask 명령 등록. 개발자 포털 → Interactions Endpoint URL: ${base}/bot/discord` : `✗ ${r.status} ${await r.text()}`);
} else if (platform === 'kakao') {
  console.log(`카카오 i 오픈빌더(사람 할 일): 스킬 → 스킬 만들기 → URL 에 ${base}/bot/kakao/<KAKAO_SKILL_SECRET 값> → 시나리오의 폴백 블록에 이 스킬 연결 → 배포.\n카카오톡 채널 관리자센터에서 채널을 만들고 오픈빌더 봇과 연결해야 한다(챗봇 사용 신청 필요할 수 있음).`);
}
