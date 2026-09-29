# 분석 이벤트 설계

## 원칙
- 핵심 지표에서 거꾸로 설계한다. "이 숫자를 알려면 어떤 이벤트가 필요한가?"
- 이벤트 이름: `객체_동작` 과거형, 소문자 스네이크 (`course_created`, `plan_shared`)
- 개인정보(이메일·이름·자유 입력 텍스트)를 이벤트 속성에 넣지 않는다.
- 처음엔 15~25개 이하로. 많으면 아무도 안 본다.

## 기본 퍼널 (AARRR)
| 단계 | 질문 | 이벤트 예 |
|---|---|---|
| 획득 | 어디서 왔나 | `landing_viewed` (utm 속성) |
| 활성화 | 첫 가치를 경험했나 | `signed_up`, `first_<핵심행동>_completed` |
| 유지 | 다시 오나 | `session_started` (D1·D7·D30 계산용) |
| 추천 | 퍼뜨리나 | `invite_sent`, `share_link_opened` |
| 수익 | 돈을 내나 | `paywall_viewed`, `checkout_started`, `purchase_completed` |

## 이벤트 표
| 이벤트 | 언제 | 속성 | 측정하는 지표 |
|---|---|---|---|

## 점검
- [ ] 활성화 이벤트(aha moment)가 명확히 정의됨
- [ ] 수익 퍼널 각 단계에 이벤트
- [ ] 오류 이벤트(`<기능>_failed` + 오류 코드)로 실패율 측정
- [ ] 분석 도구 쿠키·SDK 가 처리방침에 반영됨 (guard)
