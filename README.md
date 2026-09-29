# Atelier

1인 개발자가 아이디어부터 출시까지 단계별로 따라갈 수 있게 해 주는 Claude Code 플러그인입니다.

## 설치
```
/plugin marketplace add <owner>/atelier
/plugin install atelier@atelier
```

## 사용
`/atelier:pilot` 으로 시작합니다. 인터뷰를 거쳐 `PROJECT.md` 가 만들어지고, 이후 세션마다 현재 단계를 안내합니다.

| 스킬 | 역할 |
|---|---|
| pilot | 진행 관리 (오케스트레이터) |
| idea | 아이디어 검증·MVP 범위 |
| design | 화면 흐름·디자인 토큰·시안 |
| build | 구현·테스트·CI·배포 |
| guard | 보안·법률 점검 |
| launch | 랜딩·홍보·유저 테스트 |

법률 관련 산출물은 참고용 초안이며, 최종 판단은 전문가에게 확인하세요.
