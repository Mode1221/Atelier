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
CI 와 같은 명령을 `scripts/check.sh` 하나로 묶어 푸시 전에 돌린다.

## 배포 대상
| 형태 | 배포 | 비고 |
|---|---|---|
| 웹 (Next.js 등) | Vercel / Cloudflare | 브랜치마다 미리보기 URL |
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

## 배포 체크리스트
- [ ] 운영 환경변수 설정 (값은 플랫폼 시크릿에만)
- [ ] 도메인·HTTPS
- [ ] 에러 모니터링 DSN 연결, 테스트 에러 1건 수신 확인
- [ ] 분석 이벤트 1건 수신 확인
- [ ] DB 백업 주기 설정, 복구 1회 연습
- [ ] 롤백 방법 확인 (이전 배포로 되돌리기)
- [ ] 비용 알림(요금 한도) 설정
