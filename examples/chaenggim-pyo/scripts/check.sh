#!/usr/bin/env bash
# 푸시 전 로컬 검증 — CI 와 같은 순서. E2E 는 실제 Cloudflare 런타임(workerd)으로 돈다.
set -euo pipefail
node scripts/gen-legal.mjs >/dev/null && git diff --quiet src/legal.gen.js || { echo "legal/*.md 가 바뀌었어요 — src/legal.gen.js 를 커밋하세요"; exit 1; }
npm run quality
npm run lint
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=high
echo "✓ 모든 검사 통과"
