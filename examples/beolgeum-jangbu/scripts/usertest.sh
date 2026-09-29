#!/usr/bin/env bash
# AI 대리 사용성 테스트 (Atelier usertest) — 로컬 workerd + 빈 D1 로 띄워 docs/usertest/plan.json 을 걷는다.
# 사용: ./scripts/usertest.sh [출력 폴더]   (기본 docs/usertest/<오늘>)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-3998}
OUT=${1:-docs/usertest/$(date +%F)}
rm -rf data/usertest
npx wrangler d1 migrations apply DB --local --persist-to data/usertest >/dev/null
WRANGLER_SEND_METRICS=false npx wrangler dev --local --ip 127.0.0.1 --port "$PORT" --persist-to data/usertest >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 1; done
BASE_URL="http://127.0.0.1:$PORT" node ../../skills/usertest/scripts/walk.mjs docs/usertest/plan.json "$OUT"
