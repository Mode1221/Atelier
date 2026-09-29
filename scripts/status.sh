#!/usr/bin/env bash
# 세션 시작 시 PROJECT.md 의 현재 단계와 진행률을 컨텍스트에 넣는다.
f="${CLAUDE_PROJECT_DIR:-.}/PROJECT.md"
[ -f "$f" ] || { echo "[atelier] PROJECT.md 없음 — /atelier:pilot 로 시작하세요."; exit 0; }
done_n=$(grep -cE '^- \[x\]' "$f")
todo_n=$(grep -cE '^- \[ \]' "$f")
echo "[atelier] 진행: ${done_n}/$((done_n + todo_n)) 세부 단계 완료"
sed -n '/^## 현재 단계/,/^## /p' "$f" | sed '$d'
next=$(grep -m1 -E '^- \[ \]' "$f" | sed 's/^- \[ \] //')
[ -n "$next" ] && echo "첫 미완료 세부 단계: $next"
exit 0
