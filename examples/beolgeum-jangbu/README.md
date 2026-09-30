# 벌금장부

출석만 체크하세요. 벌금은 알아서 계산됩니다. — 가입 없이 링크 하나로 쓰는 스터디·운동 모임 벌금 장부.

**운영 중**: https://beolgeum-jangbu.atlier-skill.workers.dev

**운영 비용 0원**: Cloudflare Workers 무료 등급(Workers + D1 + 정적 자산 + 크론). 비용이 생기는 조건은 `docs/costs.md`.

## 실행
```
npm ci
npm run dev        # 실제 Cloudflare 런타임을 로컬에서 (주소는 실행 화면에 표시)
```

## 테스트
```
./scripts/check.sh # 법률 번들 · lint · 단위/API · E2E(workerd) · 의존성 감사
```

## 배포
처음 한 번(내 Cloudflare 계정으로): `npm run deploy:first` — 로그인 확인 → DB 만들기 → 마이그레이션 → 배포 → 주소 출력. 다시 실행해도 안전.

Atelier 저장소 Secrets 에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 를 넣으면 main 푸시 때 자동 배포.
처음 한 번 D1 데이터베이스도 자동으로 만든다. 롤백·장애 대응은 `docs/runbook.md`.
