#!/usr/bin/env bash
# Atelier 정기 점검 (결정적 검사). AI 없이 돈다 — 비용 0.
# 사용: ./scripts/ops-check.sh [daily|weekly|monthly|quarterly]   (상위 주기는 하위 주기 검사를 포함)
# 설정은 환경변수 (GitHub Actions 에서는 Variables / Secrets):
#   HEALTH_URLS          공백 구분 URL. 2xx 가 아니거나 HEALTH_MAX_SECONDS(기본 3) 초과면 실패
#   TLS_HOSTS            공백 구분 호스트. 인증서 만료 TLS_WARN_DAYS(기본 14)일 이내면 경고, 만료면 실패
#   EXPIRY_FILE          만료일 목록 파일 (기본 docs/ops/expiry.txt, 형식: "YYYY-MM-DD 설명")
#   EXPIRY_WARN_DAYS     만료일 경고 기준 (기본 30)
#   BACKUP_CHECK_CMD     백업 신선도 확인 명령. 0 이 아니면 실패 (weekly 이상)
#   SKIP_DEP_AUDIT=1     의존성 취약점 검사 생략 (weekly 이상)
#   CLOUDFLARE_API_TOKEN 있으면 scripts/usage.mjs 로 무료 한도 사용률 (매일, 70% 경고·90% 실패)
# 결과: 마크다운 보고서를 표준출력(+ GITHUB_STEP_SUMMARY)으로. 실패가 있으면 종료 코드 1.
set -u

period="${1:-daily}"
case "$period" in daily) lvl=1 ;; weekly) lvl=2 ;; monthly) lvl=3 ;; quarterly) lvl=4 ;;
  *) echo "알 수 없는 주기: $period" >&2; exit 2 ;; esac

fails=0; warns=0; rows=""
errf=$(mktemp); trap 'rm -f "$errf"' EXIT
row() { # 상태 항목 내용
  rows+="| $1 | $2 | $3 |"$'\n'
  case "$1" in FAIL) fails=$((fails + 1)) ;; WARN) warns=$((warns + 1)) ;; esac
}
now=$(date -u +%s)
days_until() { # 날짜 → 남은 일수. 날짜 형식이 틀리면 실패
  local ts; ts=$(date -u -d "$1" +%s 2>/dev/null) || return 1
  echo $(( (ts - now) / 86400 ))
}
oneline() { tr '\n|' '  ' <<< "$1"; }

# 1. 헬스체크 (daily)
max="${HEALTH_MAX_SECONDS:-3}"
for u in ${HEALTH_URLS:-}; do
  if ! out=$(curl -sS -o /dev/null -m 15 -w '%{http_code} %{time_total}' "$u" 2>"$errf"); then
    row FAIL "헬스체크" "$u — 연결 실패: $(oneline "$(cat "$errf")")"; continue
  fi
  code=${out%% *}; t=${out##* }
  if [[ "$code" != 2* ]]; then row FAIL "헬스체크" "$u — HTTP $code"
  elif awk "BEGIN{exit !($t > $max)}"; then row WARN "헬스체크" "$u — ${t}s (기준 ${max}s)"
  else row OK "헬스체크" "$u — HTTP $code, ${t}s"; fi
done
[ -z "${HEALTH_URLS:-}" ] && row WARN "헬스체크" "HEALTH_URLS 미설정"

# 2. TLS 인증서 (daily)
tw="${TLS_WARN_DAYS:-14}"
for h in ${TLS_HOSTS:-}; do
  end=$(echo | timeout 15 openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$end" ]; then row WARN "TLS" "$h — 인증서를 읽지 못함"; continue; fi
  d=$(days_until "$end") || { row WARN "TLS" "$h — 만료일 해석 실패: $end"; continue; }
  if [ "$d" -lt 0 ]; then row FAIL "TLS" "$h — 만료됨 ($end)"
  elif [ "$d" -le "$tw" ]; then row WARN "TLS" "$h — ${d}일 후 만료"
  else row OK "TLS" "$h — ${d}일 남음"; fi
done

# 3. 만료일 목록 (daily): 도메인·개발자 계정·API 키·결제 수단 등
ef="${EXPIRY_FILE:-docs/ops/expiry.txt}"; ew="${EXPIRY_WARN_DAYS:-30}"
if [ -f "$ef" ]; then
  while read -r dt desc; do
    [[ -z "$dt" || "$dt" == \#* ]] && continue
    d=$(days_until "$dt" 2>/dev/null) || { row WARN "만료일" "형식 오류: $dt $desc"; continue; }
    if [ "$d" -lt 0 ]; then row FAIL "만료일" "$desc — 만료됨 ($dt)"
    elif [ "$d" -le "$ew" ]; then row WARN "만료일" "$desc — ${d}일 후 ($dt)"; fi
  done < "$ef"
fi

# 4. 의존성 취약점 (weekly+)
if [ $lvl -ge 2 ] && [ "${SKIP_DEP_AUDIT:-0}" != 1 ]; then
  audit() { # 이름 명령...
    local name=$1; shift
    if out=$("$@" 2>&1); then row OK "의존성" "$name — 높음 이상 취약점 없음"
    else row FAIL "의존성" "$name — 취약점 발견 (\`$*\` 로 확인)"; fi
  }
  [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null && audit pnpm pnpm audit --prod --audit-level high
  [ -f package-lock.json ] && command -v npm >/dev/null && audit npm npm audit --omit=dev --audit-level=high
  [ -f yarn.lock ] && command -v yarn >/dev/null && audit yarn yarn npm audit --severity high
  if { [ -f requirements.txt ] || [ -f pyproject.toml ]; } && command -v pip-audit >/dev/null; then
    if [ -f requirements.txt ]; then audit pip pip-audit -r requirements.txt; else audit pip pip-audit; fi
  fi
fi

# 5. 백업 신선도 (weekly+)
if [ $lvl -ge 2 ] && [ -n "${BACKUP_CHECK_CMD:-}" ]; then
  if bash -c "$BACKUP_CHECK_CMD" >/dev/null 2>&1; then row OK "백업" "확인 명령 통과"
  else row FAIL "백업" "확인 명령 실패 — 최근 백업이 없거나 접근 불가"; fi
fi

# 5-1. 무료 한도 사용률 (Cloudflare, operate O5)
if [ -f scripts/usage.mjs ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if out=$(node scripts/usage.mjs 2>&1); then
    if grep -q '🟡' <<< "$out"; then row WARN "무료 한도" "$(oneline "$(grep '🟡' <<< "$out")")"; else row OK "무료 한도" "70% 미만"; fi
  else row FAIL "무료 한도" "$(oneline "$(grep -E '🔴|⚠️' <<< "$out" | head -3)")"; fi
fi

# 6. 사람이 할 일 알림 (monthly+)
if [ $lvl -ge 3 ]; then
  row TODO "비용" "클라우드·외부 API 청구액 확인, 사용자당 비용 갱신"
  row TODO "업데이트" "의존성 업데이트 PR, 런타임 지원 종료 일정"
fi
if [ $lvl -ge 4 ]; then
  row TODO "복구 실습" "최신 백업을 별도 환경에 복구해 핵심 흐름 확인"
  row TODO "정책" "스토어·법 정책 변경, 런북 갱신, 기한 지난 데이터 파기"
fi

report="## Atelier 점검 — $period ($(date -u +%F))

결과: **실패 $fails · 경고 $warns**

| 상태 | 항목 | 내용 |
|---|---|---|
${rows}"
echo "$report"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$report" >> "$GITHUB_STEP_SUMMARY"
[ $fails -eq 0 ]
