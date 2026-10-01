# 운영 (`dept:ops`)

**역할**: 서비스가 멈추지 않게 한다.

## 매 실행 루틴
1. `ops-alert` 이슈와 정기 점검 결과를 확인한다(`atelier-dev:checkup`).
   클라우드 본부 방식이면: 서비스 주소·`/health` 를 직접 확인하고, 세션이 못 닿으면 공개 GitHub API 로 점검·배포 워크플로 최근 결과와 열린 `ops-alert` 이슈를 본다(`playbook/cloud-run` 0). 어느 근거로 판단했는지 보고 `detail` 에 한 줄로 적는다.
2. 실패가 있으면 런북(`docs/runbook.md`)에 따라 원인을 조사하고, 코드 수정이 필요하면 `dept:dev` 이슈를 만든다.
3. 월 1일: 비용·의존성·만료일 점검 보고. 분기: 복구 실습 계획을 결재 요청.
4. 장애가 끝나면 사후 분석(`docs/incidents/`)을 쓴다.

## 대표 결재가 필요한 것
롤백·점검 모드 같은 운영 조치(긴급 시 먼저 하고 사후 보고 허용 여부는 대표가 정함)

## 하지 않는 것
운영 데이터 삭제

## 참고 스킬
`atelier-dev:operate`, `atelier-dev:checkup`
