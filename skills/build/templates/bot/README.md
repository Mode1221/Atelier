# 챗봇 (카카오톡 채널 · 디스코드 · 텔레그램)

| 플랫폼 | 사람 할 일 | 비밀값(.dev.vars · wrangler secret) |
|---|---|---|
| 텔레그램 | 텔레그램 앱에서 @BotFather → `/newbot` → 토큰 복사 | `TELEGRAM_TOKEN`, `TELEGRAM_SECRET`(긴 무작위 — `auto`) |
| 디스코드 | discord.com/developers → New Application → Bot 만들기 → 서버에 초대(OAuth2 URL, `applications.commands`) | `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN` |
| 카카오톡 | 카카오톡 채널 만들기(관리자센터) → 카카오 i 오픈빌더 봇 만들기·채널 연결(챗봇 사용 신청) → 스킬 URL 등록 | `KAKAO_SKILL_SECRET`(긴 무작위 — `auto`) |

순서: `src/bot/bot.js` 복사 → `mountBots(app, { reply })` → `npm run deploy:first` → `node scripts/bot-setup.mjs <플랫폼> <주소>`.
- 답이 느리면 실패한다(카카오 5초, 디스코드 3초). AI 답은 `../ai/ai.js` 의 `maxTokens` 를 작게(예: 400).
- 홍보·광고성 메시지를 먼저 보내는 기능(푸시)은 플랫폼 정책·정보통신망법(광고성 정보 수신 동의) 대상 — guard.
