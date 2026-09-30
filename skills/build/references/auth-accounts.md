# 인증·계정 체크리스트

인증은 검증된 서비스(Supabase Auth, Firebase Auth, Clerk, Auth.js 등)나 공식 SDK 로 구현한다.

## 기본 조합: Cloudflare Workers + Supabase Auth (무료) — `../templates/auth/`
- `supabase-auth.js` → 프로젝트 `src/auth/`: 서버는 로그인 토큰을 Supabase 공개키(JWKS)로 **검증만** 한다(`requireUser`). 탈퇴는 `deleteUser`(내 DB 데이터를 먼저 지운 뒤).
- `login.html`: 이메일로 받은 링크로 로그인(비밀번호 없음), 로그인 뒤 요청은 `authFetch` 로. 서버에 `GET /api/auth-config` → `{url, anonKey}`.
- `.dev.vars.example` 에 `SUPABASE_URL=` `SUPABASE_ANON_KEY=` `SUPABASE_SERVICE_ROLE_KEY=` (빈 값) → `npm run deploy:first` 가 배포 때 붙여 넣으라고 묻는다.
- **사람 할 일 (한 번, 5분)**: supabase.com 무료 가입 → New project → Project Settings → API 에서 주소·anon 키·service_role 키 복사(deploy:first 가 물을 때 붙여 넣기) → Authentication → URL Configuration 의 Site URL 에 서비스 주소. 무료 프로젝트는 오래 안 쓰면 잠든다(free-tier.md).
- 테스트: 단위 테스트는 가짜 공개키로 서명한 토큰(`tests/build.test.mjs` 참고), E2E 는 로그인 없는 경로 + 서버 검증 거절 확인.

## 가입·로그인
- [ ] 로그인 방식 결정: 소셜(카카오·네이버·Google·Apple), 이메일 매직 링크, 이메일+비밀번호
- [ ] 소셜 로그인 앱 등록·리디렉션 URL 을 환경별(개발·스테이징·운영)로 등록
- [ ] iOS 앱에서 제3자 소셜 로그인을 쓰면 Apple 심사 요건 확인 (guard G6)
- [ ] 이메일 인증(필요 시), 같은 이메일로 여러 방식 가입 시 계정 연결 정책
- [ ] 로그인 실패 메시지가 계정 존재 여부를 드러내지 않음
- [ ] 로그인·가입·재설정에 속도 제한, 봇 방어(필요 시 캡차)
- [ ] 비로그인 체험 → 로그인 시 데이터 이전 (체험 모드가 있다면)

## 세션
- [ ] 토큰 만료·갱신, 로그아웃 시 무효화
- [ ] 모든 기기 로그아웃 (비밀번호 변경 시)
- [ ] 웹: HttpOnly·Secure 쿠키, 앱: Keychain/Keystore 저장

## 계정 관리
- [ ] 비밀번호 재설정 (링크 만료 시간, 1회용)
- [ ] 이메일·프로필 변경
- [ ] **탈퇴**: 앱 안에서 가능 (스토어 필수), 탈퇴 시 데이터 처리 = spec S2 보존 정책
  - 즉시 비공개 → 유예 기간 후 영구 삭제 (법령상 보관 필요한 기록은 분리 보관)
  - 외부 서비스(결제·분석·이메일)의 사용자 데이터도 삭제 요청
  - 구독 중이면 해지 안내
- [ ] 데이터 내보내기(요청 시) 경로

## 권한
- [ ] 역할: 사용자 / 관리자 (필요 시 팀·공유 권한)
- [ ] 모든 API 가 서버에서 "이 사용자가 이 리소스에 접근 가능한가"를 확인
- [ ] 다른 사용자 ID 로 요청해서 막히는지 테스트 (자동 테스트로 남긴다)

## 미성년자
- [ ] 만 14세 미만 가입 가능하면 법정대리인 동의 절차, 아니면 가입 시 연령 확인
