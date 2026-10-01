# Atelier 평가 묶음 (`claude plugin eval`)

스킬이 실제 대화에서 기대대로 움직이는지 채점한다. 단위 테스트(`tests/`)가 스크립트를 보고, 여기는 **스킬 안내를 따른 결과**를 본다.

| 케이스 | 보는 것 | 비용(1회, 대략) |
|---|---|---|
| `pilot-start` | 처음 쓰는 사람에게 코드 대신 쉬운 인터뷰부터 | $0.1 |
| `pilot-next-step` | "다음에 뭐 해?" — 나중 항목이 아닌 필수 다음 단계, 5줄 틀 | $0.12 |
| `company-brief` | 로컬 AI 회사 브리핑 — 결재 번호·"1번 승인"·짧게 | $0.1 |
| `pilot-error-help` | 오류를 붙여 넣으면 무슨 일·어떻게·누가(사람/AI)를 짧게, 기록 먼저·설명은 마지막 | $0.12 |
| `guard-rules` | 업종 규제 판정 → `docs/rules.md`, 거래 대금 직접 보관 같은 설계 금지 항목 지적 | $0.16 |
| `pilot-auto-fastpath` | "알아서 해" — 빠른 길 PROJECT.md, 1단계 산출물(이름·상표 표), 짧은 보고 | $0.5 |

```bash
# 싼 것만 (스킬 문서를 고칠 때마다)
claude plugin eval . --tag cheap --runs 2 --ablation none --scaffold --allow-tools Bash --trust-plugin --no-publish
# 전체
claude plugin eval . --runs 1 --ablation none --scaffold --allow-tools Bash Write Edit WebSearch --trust-plugin --no-publish --max-cost-usd 5
```
- Linux 에서는 Bash 가 샌드박스 안에서 돌아야 해서 `bubblewrap`·`socat` 이 있어야 한다(`apt install bubblewrap socat`).
- `--scaffold` 는 케이스의 `setup.sh` 로 `fixture/` 를 작업 폴더에 깐다(직접 쓴 케이스만).
- 결과는 `evals/results/`(커밋하지 않음).
- LLM 채점(기본 haiku)은 가끔 흔들린다. 실패하면 `aggregate-result.json` 의 `evidence`(마지막 답)를 먼저 읽고, 답이 맞으면 기준 문구를 고친다 — 스킬을 기준에 억지로 맞추지 않는다.
