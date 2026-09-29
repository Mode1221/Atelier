# 벌금장부

출석만 체크하세요. 벌금은 알아서 계산됩니다. — 가입 없이 링크 하나로 쓰는 스터디·운동 모임 벌금 장부.

## 실행
```
npm ci
npm run dev        # http://localhost:3000
```
Node 22.13 이상 필요 (`node:sqlite`).

## 테스트
```
./scripts/check.sh # lint · 단위/API · E2E(Playwright) · 의존성 감사
```

## 배포
Docker 이미지 + Fly.io 예시(`Dockerfile`, `fly.toml`). `main` 푸시 → CI 통과 → `FLY_API_TOKEN` 이 있으면 배포 후 스모크 테스트.
롤백·장애 대응은 `docs/runbook.md`.
