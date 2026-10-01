# CI · 배포

## CI 최소 구성 (GitHub Actions)
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```
스택에 맞게 setup 단계·명령을 바꾼다. 액션 버전은 최신 태그를 확인한다.

## 로컬 검증 스크립트
CI 와 같은 명령을 `npm run check`(`../templates/check.mjs` → `scripts/check.mjs`, Windows·Mac 공통) 하나로 묶어 푸시 전에 돌린다.

## 무료 배포: Cloudflare Workers + D1 (GitHub Actions)
사람이 할 일은 Cloudflare 가입(카드 불필요)과 시크릿 2개 등록뿐이다. 나머지는 워크플로가 처음 한 번 알아서 만든다.
```yaml
deploy:
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}   # 템플릿 "Edit Cloudflare Workers" + D1 Edit
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  steps:
    - run: npm ci
    - run: |   # D1 이 없으면 만들고, wrangler.toml 의 자리표시 ID 를 실제 ID 로
        id=$(npx wrangler d1 list --json | jq -r '.[] | select(.name=="<db>") | .uuid')
        [ -z "$id" ] && npx wrangler d1 create <db> && id=$(npx wrangler d1 list --json | jq -r '.[] | select(.name=="<db>") | .uuid')
        sed -i "s/LOCAL_PLACEHOLDER/$id/" wrangler.toml
        npx wrangler d1 migrations apply DB --remote
    - run: npx wrangler deploy
```
- 시크릿이 없으면 배포 단계를 **경고와 함께 건너뛰게** 만든다 (CI 는 녹색 유지).
- 처음 계정은 Workers & Pages 메뉴를 한 번 열어 `workers.dev` 하위 주소를 정해야 할 수 있다.
- 예시 전체: Atelier 저장소 `.github/workflows/beolgeum.yml`.

## 배포 대상
| 형태 | 배포 | 비고 |
|---|---|---|
| 웹 (서버·DB 포함) | **Cloudflare Workers + D1 (무료)** | `wrangler rollback`, D1 Time Travel 백업 |
| 웹 (Next.js 등) | Cloudflare Pages / Netlify (무료), Vercel (Hobby 비상업) | 브랜치마다 미리보기 URL |
| API 서버 | Fly.io, Render, Railway | 헬스체크 엔드포인트 둔다 |
| 모바일 (Expo) | EAS Build → TestFlight / Play 내부 테스트 | 스토어 제출은 사람이 최종 확인 |
| 모바일 (Flutter/네이티브) | Fastlane 또는 Xcode·Play Console | 서명 키 백업 필수 |
| 게임 (itch.io) | butler CLI | |
| 게임 (Steam) | Steamworks SDK / SteamPipe | 스토어 페이지 심사 기간 고려 |

## 환경
| 환경 | 용도 | 데이터 | 배포 시점 |
|---|---|---|---|
| 개발 | 로컬 | 시드 데이터 | 항상 |
| 스테이징 | 확인·QA·미리보기 | 운영과 분리된 DB | PR·브랜치마다 |
| 운영 | 실제 사용자 | 운영 DB | main 머지 후 |
- 환경마다 키·DB·소셜 로그인 설정 분리.
- 스테이징에 운영 개인정보를 복사하지 않는다.

## 롤백
- 코드: 이전 배포로 되돌리기(플랫폼 기능) 또는 이전 이미지 태그 재배포
- DB: 되돌릴 수 없는 마이그레이션(컬럼 삭제 등)은 2단계로 — 먼저 코드가 안 쓰게 배포, 다음 배포에서 삭제
- 앱: 스토어 배포는 되돌리기 어렵다 → 단계적 출시(staged rollout) + 원격 기능 플래그

## 컨테이너 빌드가 인증서 오류로 실패할 때
사내·샌드박스 프록시 환경에선 `npm ci` 가 `SELF_SIGNED_CERT_IN_CHAIN` 으로 실패한다. 로컬 확인용으로만 CA 를 주입한 Dockerfile 변형을 쓰고(`NODE_EXTRA_CA_CERTS`), 저장소의 Dockerfile 에는 넣지 않는다.

## 배포 체크리스트
- [ ] 운영 환경변수 설정 (값은 플랫폼 시크릿에만)
- [ ] 도메인·HTTPS — 사기·붙이기·옛 주소 이전 순서는 `domain.md`
- [ ] 에러 모니터링 DSN 연결, 테스트 에러 1건 수신 확인
- [ ] 분석 이벤트 1건 수신 확인
- [ ] DB 백업 주기 설정, 복구 1회 연습
- [ ] 롤백 방법 확인 (이전 배포로 되돌리기)
- [ ] 비용 알림(요금 한도) 설정
