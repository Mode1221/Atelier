#!/usr/bin/env bash
# 푸시 전 로컬 검증 — CI 와 같은 순서
set -euo pipefail
npm run lint
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=high
echo "✓ 모든 검사 통과"
