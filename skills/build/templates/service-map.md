# 서비스 지도 — <서비스 이름>

> 대표가 "어디에 뭐가 있지?"를 물을 때 이 한 장으로 답한다. **비밀번호·토큰 값은 적지 않는다** (이름과 보관 위치만).
> 마지막 갱신: YYYY-MM-DD

## 한눈에
| 무엇 | 어디 |
|---|---|
| 서비스 주소 | https://… |
| 코드 | GitHub `owner/repo` 폴더 `…` / 또는 이 컴퓨터 폴더 `…` (백업: `npm run backup` → `…`) |
| 서비스가 도는 곳 | Cloudflare Workers `…` (계정: …) |
| 데이터(DB) | Cloudflare D1 `…` · 자동 시점 복구 7일 |
| 파일 저장 | (있으면) R2 `…` |
| 지표 보는 곳 | `https://…/stats` (토큰은 비밀번호 관리자) 또는 AI 회사 본부 |
| 장애 알림이 오는 곳 | 휴대폰 ntfy 주제 / GitHub 이슈 메일 (`…@…`) |
| 의견(피드백)이 모이는 곳 | GitHub 이슈 라벨 `feedback` / `company/<서비스>/feedback/` |
| 월 비용 | 0원 (무료 등급) — 자세히 `docs/costs.md` |

## 계정 (비밀번호는 비밀번호 관리자에만)
| 서비스 | 용도 | 가입 이메일 | 2단계 인증 | 결제 수단 | 비고 |
|---|---|---|---|---|---|
| Cloudflare | 서버·DB | … | ☐ | 없음 | |
| GitHub | 코드·자동 배포 | … | ☐ | 없음 | |
| (도메인 업체) | 주소 | … | ☐ | 카드 | 갱신일 YYYY-MM-DD |
| (스토어·결제·이메일 발송 등) | | | ☐ | | |
| 운영 이메일 | 위 계정 복구 통로 | … | ☐ | | 이 계정이 뚫리면 전부 위험 |

## 비밀값 (값은 적지 않는다)
| 이름 | 쓰는 곳 | 보관 위치 | 바꾸는 법 |
|---|---|---|---|
| `FEEDBACK_TOKEN` | 의견 가져오기 | Cloudflare 시크릿 + `.atelier/secrets.json` | `npm run deploy:first` 다시 |
| … | | GitHub Secrets / Cloudflare 시크릿 | |

## 자동으로 도는 것 (다시 켜거나 끌 때 여기 보고)
| 무엇 | 언제 | 어디 | 끄는 법 |
|---|---|---|---|
| 배포 | main 에 올릴 때 | `.github/workflows/…` | 워크플로 끄기 |
| 데이터 정리 크론 | 매일 03:xx | `wrangler.toml` `[triggers]` | |
| 운영 점검 | 매시간/매일 | … | |
| AI 회사 부서 | … | `company/` / 본부 | |

## 컴퓨터를 잃어버렸을 때
1. 새 컴퓨터에 Node·Git·Claude Code 설치
2. 코드 받기: `git clone …` (또는 백업 폴더의 `.bundle`)
3. `npm ci` → Cloudflare 로그인(`npx wrangler login`) → 지금 서비스는 그대로 돈다 (코드만 다시 받으면 됨)
4. 비밀값은 비밀번호 관리자에서, 없으면 `npm run deploy:first` 로 새로 만든다
