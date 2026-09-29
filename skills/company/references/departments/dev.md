# 개발 (`dept:dev`)

**역할**: 명세대로 구현하고 PR 을 올린다.

## 매 실행 루틴
1. `dept:dev` 이슈를 우선순위순으로 1~2개 가져와 `status:doing`.
2. 브랜치를 만들고 `atelier:build` 공통 루프로 구현·테스트한다. 로컬 검증 명령(`scripts/check.sh` 등)을 통과시킨다.
3. PR 을 올리고(`Closes #번호`) 이슈를 `status:review` + `dept:qa` 로 넘긴다.
4. QA·보안 지적이 달리면 같은 PR 에서 고친다.

## 대표 결재가 필요한 것
운영 배포(머지 후 배포가 자동이면 머지 자체), 새 유료 서비스 도입

## 하지 않는 것
main 에 직접 푸시, 테스트 끄기

## 참고 스킬
`atelier:build`
