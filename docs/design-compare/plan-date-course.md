# 커플 데이트 코스 추천 웹 — 디자인 도구 계획 예시 (tool-plan.mjs 출력)

아래 첫 판은 이 저장소 검증 환경(외부 스킬 설치 없음, `--detect` 결과 빈 목록), 둘째 판은 4개 모두 설치됐을 때. 요금제는 Pro(절약).

## 1. 설치 없음 (이 환경)
만든 날: 2026-09-30 · 기준: atelier design/references/design-routing.md · **이후 단계는 이 절만 읽고 다시 판단하지 않는다.**

- 유형: 전체 = 감성·소비자형 — impeccable 모드 Experience / 소개·가입 화면은 Persuade
- 예산 모드: 절약 (Pro 기준 — 시안 1안, 검증 1회, 스킬 명령 단계당 최대 1개). 바꾸려면 이 줄만 고친다.
- 설치 확인: frontend-design — · impeccable — · brandkit — · playwright-mcp —

#### 감성·소비자형
| 단계 | 할 일 | 비고 |
|---|---|---|
| D0 방향 | (design-direction.md 로 방향 1장 + D2 와이어프레임) | impeccable 없음 → 괄호 안 대체 |
| D4 시안 | 토큰 HTML + Playwright 스크립트 캡처 + (캡처 보고 design-direction.md 5절 자체 검토 1회) | impeccable 없음 → 괄호 안 대체 |
| D6 접근성 | accessibility-checklist.md (스킬 없음) |  |
| D7 브랜드 | (brand-assets.md 규격으로 SVG 직접 제작 → PNG 캡처) | brandkit 없음 → 괄호 안 대체 |
| L5 출시 전 | (캡처 보고 design-direction.md 5절 자체 검토 1회) | impeccable 없음 → 괄호 안 대체 |
| usertest | (Playwright 스크립트만 (walk.mjs)) | playwright-mcp 없음 → 괄호 안 대체 |
| grow 새 화면 | 작은 변경: 스킬 없음 / (캡처 보고 design-direction.md 5절 자체 검토 1회) | impeccable 없음 → 괄호 안 대체 |

규칙: 디자인 스킬은 사람에게 보이는 결과물에만 · 명령의 참고 문서만 읽기 · 캡처는 Playwright 스크립트(playwright-mcp 는 대화형 조작이 필요할 때만) · grow 작은 변경은 스킬 없이.

설치 안내 (이 유형에 필요, 선택):
- impeccable: 화면 설계·검토·다듬기 명령 — npx impeccable install (프로젝트 폴더에서, 설치 뒤 Claude Code 다시 열기)
- brandkit: 로고·브랜드 보드 이미지 프롬프트 — npx skills add https://github.com/Leonxlnx/taste-skill --skill brandkit
- playwright-mcp: 대화형 브라우저 조작 (usertest 탐색·레이아웃 버그) — claude mcp add playwright npx @playwright/mcp@latest
## 2. 4개 모두 설치
만든 날: 2026-09-30 · 기준: atelier design/references/design-routing.md · **이후 단계는 이 절만 읽고 다시 판단하지 않는다.**

- 유형: 전체 = 감성·소비자형 — impeccable 모드 Experience / 소개·가입 화면은 Persuade
- 예산 모드: 절약 (Pro 기준 — 시안 1안, 검증 1회, 스킬 명령 단계당 최대 1개). 바꾸려면 이 줄만 고친다.
- 설치 확인: frontend-design ✅ · impeccable ✅ · brandkit ✅ · playwright-mcp ✅

#### 감성·소비자형
| 단계 | 할 일 | 비고 |
|---|---|---|
| D0 방향 | /impeccable shape — 시안 1안 |  |
| D4 시안 | 토큰 HTML + Playwright 스크립트 캡처 + /impeccable critique |  |
| D6 접근성 | accessibility-checklist.md (스킬 없음) |  |
| D7 브랜드 | brandkit: 로고·브랜드 보드 프롬프트 → 이미지 생성기 |  |
| L5 출시 전 | /impeccable polish |  |
| usertest | Playwright 스크립트(walk.mjs) 기본, 스크립트로 못 찾는 막힘·레이아웃 버그만 playwright-mcp |  |
| grow 새 화면 | 작은 변경: 스킬 없음 / /impeccable critique (새 화면일 때만 1회) |  |

규칙: 디자인 스킬은 사람에게 보이는 결과물에만 · 명령의 참고 문서만 읽기 · 캡처는 Playwright 스크립트(playwright-mcp 는 대화형 조작이 필요할 때만) · grow 작은 변경은 스킬 없이.

