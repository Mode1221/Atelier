#!/usr/bin/env bash
# 세션 시작 시 PROJECT.md 의 현재 단계와 진행률을 컨텍스트에 넣는다.
# 준비물 확인: 없으면 한 줄로 알린다 (Claude 가 /atelier-dev:pilot 1절 0번대로 설치를 돕는다)
missing=()
if command -v node >/dev/null 2>&1; then
  [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ] || missing+=("Node.js 22 이상 (지금 $(node -v))")
else missing+=("Node.js"); fi
command -v git >/dev/null 2>&1 || missing+=("Git")
[ ${#missing[@]} -gt 0 ] && echo "[atelier] 준비 필요: ${missing[*]} — \"설치 도와줘\" 라고 말하면 Claude 가 설치를 도와요 (pilot 1절 0번)."
f="${CLAUDE_PROJECT_DIR:-.}/PROJECT.md"
[ -f "$f" ] || { echo "[atelier] PROJECT.md 없음 — /atelier-dev:pilot 로 시작하세요."; exit 0; }
roadmap=$(sed -n '/^## 로드맵/,/^## [^0-9]/p' "$f")
done_n=$(grep -cE '^- \[x\]' <<< "$roadmap")
# 빠른 길로 미룬 것(— 나중)·해당 없음은 남은 일로 세지 않는다
todo_n=$(grep -E '^- \[ \]' <<< "$roadmap" | grep -cvE 'N/A|건너뜀|나중 \(빠른 길\)')
later_n=$(grep -cE '^- \[ \].*나중 \(빠른 길\)' <<< "$roadmap")
human_n=$(sed -n '/^## 사람 할 일/,/^## /p' "$f" | grep -cE '^- \[ \]')
echo "[atelier] 진행: ${done_n}/$((done_n + todo_n)) 세부 단계 완료${later_n:+ (나중으로 미룸 ${later_n}개)} · 사람 할 일 ${human_n}개 남음"
sed -n '/^## 현재 단계/,/^## /p' "$f" | sed '$d'
# 다음 할 일: 현재 단계 절 안에서 N/A·건너뜀·사람 대기가 아닌 첫 미완료 (없으면 전체에서)
stage=$(sed -n '/^## 현재 단계/,/^## /p' "$f" | grep -m1 -oE '단계: *[0-9]' | grep -oE '[0-9]')
pick() { grep -E '^- \[ \]' | grep -vE 'N/A|건너뜀|사람 대기|나중 \(빠른 길\)' | head -1 | sed 's/^- \[ \] //'; }
next=""
[ -n "$stage" ] && next=$(sed -n "/^### ${stage} /,/^### /p" <<< "$roadmap" | pick)
[ -z "$next" ] && next=$(pick <<< "$roadmap")
[ -n "$next" ] && echo "다음 세부 단계: $next"
waiting=$(grep -cE '^- \[ \].*사람 대기' <<< "$roadmap")
[ "$waiting" -gt 0 ] && echo "사람 대기 중인 세부 단계 ${waiting}개 (PROJECT.md \"사람 할 일\")"
# 증거 검사: 완료로 체크됐는데 결과물이 없는 항목 (pilot gate-check)
gc="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/skills/pilot/scripts/gate-check.mjs"
if command -v node >/dev/null 2>&1 && [ -f "$gc" ]; then
  out=$(node "$gc" "$f" 2>/dev/null | grep '^✗')
  [ -n "$out" ] && { echo "[atelier] 증거 없는 완료 표시가 있어요 — 먼저 확인:"; echo "$out"; }
fi
# 플러그인을 업데이트했는데 프로젝트에 복사해 둔 검사 도구가 옛 버전이면 알린다 (CI 는 복사본으로 돈다)
inst="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/skills/pilot/scripts/install-tools.mjs"
proj="${CLAUDE_PROJECT_DIR:-.}"
if command -v node >/dev/null 2>&1 && [ -d "$proj/scripts/atelier" ] && [ -f "$inst" ]; then
  if ! node "$inst" "$proj" --check >/dev/null 2>&1; then
    have=$(grep -m1 -oE 'Atelier [0-9.]+' "$proj/scripts/atelier/gate-check.mjs" 2>/dev/null | cut -d' ' -f2)
    echo "[atelier] 플러그인이 업데이트됐어요 — 프로젝트의 검사 도구(scripts/atelier, ${have:-옛 버전})를 맞춰야 해요. \"도구 업데이트해 줘\" 라고 하면 install-tools 로 맞추고, AI 회사(company/·클라우드 본부)가 있으면 본부 규칙도 함께 갱신해요."
  fi
fi
exit 0
