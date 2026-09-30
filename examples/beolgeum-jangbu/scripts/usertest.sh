#!/usr/bin/env bash
# AI 대리 사용성 테스트 (Atelier usertest) — 로컬 workerd + 빈 D1 로 띄워 docs/usertest/plan.json 을 걷는다.
# 사용: ./scripts/usertest.sh [출력 폴더]   (기본 docs/usertest/<오늘>)
set -euo pipefail
cd "$(dirname "$0")/.."
# 포트: 지정(PORT)하면 비었는지 확인하고 쓰이는 중이면 멈춘다. 지정하지 않으면 빈 포트를 고른다.
if [ -n "${PORT:-}" ]; then node scripts/free-port.mjs --check "$PORT"; else PORT=$(node scripts/free-port.mjs); fi
INSPECTOR_PORT=$(node scripts/free-port.mjs)
OUT=${1:-docs/usertest/$(date +%F)}
rm -rf data/usertest
npx wrangler d1 migrations apply DB --local --persist-to data/usertest >/dev/null
WRANGLER_SEND_METRICS=false npx wrangler dev --local --ip 127.0.0.1 --port "$PORT" --inspector-port "$INSPECTOR_PORT" --persist-to data/usertest >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
up=
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$PORT/health" >/dev/null && { up=1; break; }; sleep 1; done
[ -n "$up" ] || { echo "✗ 테스트 서버가 포트 $PORT 에서 뜨지 않았어요" >&2; exit 1; }
BASE_URL="http://127.0.0.1:$PORT" node ../../skills/usertest/scripts/walk.mjs docs/usertest/plan.json "$OUT"
