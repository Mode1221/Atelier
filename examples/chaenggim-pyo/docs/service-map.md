# 서비스 지도 — 챙김표

> 대표가 "어디에 뭐가 있지?"를 물을 때 이 한 장으로 답한다. **비밀번호·토큰 값은 적지 않는다** (이름과 보관 위치만).
> 마지막 갱신: 2026-09-30

## 한눈에
| 무엇 | 어디 |
|---|---|
| 서비스 주소 | https://chaenggim-pyo.atlier-skill.workers.dev (임시 주소 — 자체 도메인은 당분간 안 삼, 대표 결정) |
| 코드 | GitHub `Mode1221/Atelier-dev` 의 `examples/chaenggim-pyo/` |
| 서비스가 도는 곳 | Cloudflare Workers `chaenggim-pyo` (Atelier 운영 계정 `atlier-skill`) |
| 데이터(DB) | Cloudflare D1 `chaenggim-pyo` · 자동 시점 복구 7일 |
| 지표 보는 곳 | https://chaenggim-pyo.atlier-skill.workers.dev/stats (지표 토큰 — 대표가 받은 파일) |
| 장애 알림이 오는 곳 | 매시간 점검 실패 → GitHub 이슈(라벨 `ops-alert-chaenggim`) → 저장소 주인 메일. 휴대폰 알림은 안 씀 (대표 결정) |
| 의견(피드백)이 모이는 곳 | 매일 09:43 GitHub 이슈 `[챙김표] 베타 피드백 …` (라벨 `svc:chaenggim`) |
| AI 회사 본부 | `examples/chaenggim-pyo/company/chaenggim/` (로컬 모드) |
| 월 비용 | 0원 (Cloudflare 무료 등급) — `docs/costs.md` |

## 계정 (비밀번호는 비밀번호 관리자에만)
| 서비스 | 용도 | 가입 이메일 | 2단계 인증 | 결제 수단 | 비고 |
|---|---|---|---|---|---|
| Cloudflare | 서버·DB | Atelier 운영 이메일 | ☐ 확인 필요 | 없음 | 벌금장부와 같은 계정 |
| GitHub `Mode1221` | 코드·자동 배포·이슈 알림 | 대표 이메일 | ☐ 확인 필요 | 없음 | |
| atlier.skill@gmail.com | 문의 창구·약관 연락처 | — | ☐ 확인 필요 | | 위 계정 복구 통로일 수 있음 |

## 비밀값 (값은 적지 않는다)
| 이름 | 쓰는 곳 | 보관 위치 | 바꾸는 법 |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | 자동 배포 | GitHub Secrets | Cloudflare 대시보드에서 새 토큰 → Secrets 교체 |
| `CHAENGGIM_STATS_TOKEN` | 지표 화면·API | GitHub Secrets → 배포 때 Cloudflare 시크릿 | Secrets 값 바꾸고 재배포 |
| `FEEDBACK_TOKEN` | 의견 수집 | 배포 때 Cloudflare 토큰에서 자동 생성 | 사람 몫 없음 |

## 자동으로 도는 것
| 무엇 | 언제 | 어디 | 끄는 법 |
|---|---|---|---|
| 테스트 → 배포 → 운영 점검 | main 에 `examples/chaenggim-pyo/**` 변경이 올라갈 때 | `.github/workflows/chaenggim.yml` | 워크플로 끄기 |
| 운영 점검 (헬스·인증서) | 매시간 21분 | `.github/workflows/chaenggim-ops.yml` | 워크플로 끄기 |
| 의견 → 이슈 | 매일 09:43 | `.github/workflows/chaenggim-feedback.yml` | 워크플로 끄기 |
| 데이터 정리 (삭제 30일·방치 180일·되살리기 7일) | 매일 03:23 | `wrangler.toml` `[triggers]` | crons 비우고 배포 |

## 컴퓨터를 잃어버렸을 때
코드는 GitHub 에 있고 서비스는 Cloudflare 에서 계속 돈다. 새 컴퓨터에서 `git clone https://github.com/Mode1221/Atelier-dev` → `examples/chaenggim-pyo` 에서 `npm ci` → 이어서 작업.
