#!/usr/bin/env bash
# 세션 시작 시 PROJECT.md 의 현재 단계를 컨텍스트에 넣는다.
f="${CLAUDE_PROJECT_DIR:-.}/PROJECT.md"
[ -f "$f" ] || { echo "[atelier] PROJECT.md 없음 — /atelier:pilot 로 시작하세요."; exit 0; }
echo "[atelier] 현재 상태:"
sed -n '/^## 현재 단계/,/^## 결정 기록/p' "$f" | head -40
