# 구현 — 벌금장부

> Atelier `build` 스킬로 작성. 판정: ✅ 통과 / ⏳ 사람 필요 / N/A

## 세부 단계 결과
| 단계 | 결과 |
|---|---|
| B1 기반 | ✅ Node 22 + Hono, ESLint, Vitest, Playwright, `scripts/check.sh`, CI(`.github/workflows/ci.yml`), `.env.example`, `CLAUDE.md` |
| B2 데이터 | ✅ `migrations/001_init.sql` + `schema_migrations`, 외래키·인덱스·CHECK 제약, 저장소 어댑터 `src/repo.js` |
| B3 인증·계정 | ✅ 계정 대신 관리 키(144비트, SHA-256 해시 저장, 상수 시간 비교, `#k=` 조각 → 헤더), 키 실패 속도 제한, 모임 삭제(30일 후 영구 삭제) |
| B4 핵심 기능 | ✅ F1~F6 (F6 카톡 복사 포함) |
| B5 결제 | N/A (과금 없음) |
| B6 알림 | N/A (계정·이메일 없음) |
| B7 관리자 도구 | ✅ `scripts/admin.js` find/delete/restore/purge/stats + 감사 로그 `data/admin-audit.log` |
| B8 오류 처리 | ✅ 상태별 화면(빈·오류·권한 없음·404·한도), 네트워크 실패 시 입력 유지(E2E), 10초 타임아웃, 버튼 중복 제출 방지, 동시 수정 충돌 409 |
| B9 계측 | ⚠️ 구조화 로그(JSON, 요청 ID, IP 해시) · 이벤트 로그 · `/health` ✅ / **에러 모니터링 서비스(Sentry 등) ⏳ 계정 필요** |
| B10 테스트 | ✅ 단위·API 31개(권한·IDOR·XSS·IP 위조·한도·스냅숏·로그 개인정보·DB 장애·백업 헬스), E2E 7개(핵심 흐름·실패·404·axe 접근성 라이트/다크) |
| B11 성능·SEO | ✅ 아래 측정. SEO: 첫 화면만 색인, `/g/`·`/api/` 는 `robots.txt`·`noindex` 로 제외, OG 태그 |
| B12 배포 | ✅ Dockerfile(비루트 사용자, 헬스체크) 로컬 빌드·실행·백업 확인, **롤백 실습**(깨진 배포 → 이전 이미지로 복구) / ⏳ Fly.io 앱·볼륨·토큰, 스테이징 환경 |
| B13 운영 준비 | 아래 표 |

## 성능 측정 (로컬, 동시 20, `scripts/bench.js`)
| 시나리오 | 초당 | p50 ms | p95 ms | 목표 p95 500ms |
|---|---|---|---|---|
| 첫 화면 | 2211 | 6.9 | 17.9 | ✅ |
| 모임 화면 (15명·50회차) | 277 | 65.6 | 132.0 | ✅ |
| 회차 저장 | 1163 | 12.7 | 39.0 | ✅ (쓰기 한도 분당 120회 초과분은 429 — 의도된 동작) |

## B13 운영 준비 체크리스트
| 항목 | 판정 | 근거 |
|---|---|---|
| Must 수용 기준 E2E | ✅ | `e2e/flow.spec.js` |
| 상태별 화면 | ✅ | `src/views.js`, E2E 오류·404 |
| 외부 서비스 폴백 | N/A | 외부 서비스 없음 |
| 마이그레이션으로만 스키마 변경 | ✅ | `src/db.js` |
| 자동 백업 설정 | ✅ | 서버가 24시간마다 백업(`src/backup.js`), `/health?backup=1` 로 신선도 감시 |
| 탈퇴·삭제 데이터 처리 | ✅ | 모임 삭제 → 30일 후 영구 삭제, 테스트 |
| 비밀값 없음 | ✅ | 비밀값 자체가 없음(관리 키는 사용자 소유), `.gitignore` |
| 서버 권한 검사·IDOR 테스트 | ✅ | `test/api.test.js` |
| 비용 드는 호출 한도 | N/A | 외부 호출 없음. 생성·쓰기 속도 제한은 있음 |
| HTTPS·보안 헤더 | ✅/⏳ | CSP·nosniff·no-referrer·DENY ✅, HTTPS 는 Fly `force_https` ⏳ |
| 에러 모니터링 수신 | ⏳ | 계정 필요 |
| 헬스체크 | ✅ | `/health` |
| 분석 이벤트 수신 | ✅ | 서버 로그 이벤트 (테스트로 확인) |
| 스테이징·운영 분리 | ⏳ | Fly 앱 2개 필요 |
| CI 녹색에서만 배포 | ⚠️ | 워크플로 작성, **GitHub 에서 실행 전** |
| 롤백 실습 | ✅ | Docker 이미지 태그로 로컬 실습 |
| 사용자 정지·삭제 방법 | ✅ | `scripts/admin.js delete` |
| 응답 시간 측정 | ✅ | 위 표 |
| 비용 알림 | ⏳ | Fly 결제 한도 |
| README·CLAUDE.md | ✅ | |

**게이트 판정: 코드 측 필수 항목 통과, 사람 필요 항목 대기** (에러 모니터링, HTTPS/호스팅, 스테이징, GitHub 에서 CI 실행, 비용 알림). reviewer 판정: 보류.

## 관리자 절차
- 신고된 모임 비공개: `node scripts/admin.js delete <모임ID>` (30일 내 `restore` 가능)
- 통계: `node scripts/admin.js stats` — 북극성 지표 `weekly_active_groups`
