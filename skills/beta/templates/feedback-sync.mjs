#!/usr/bin/env node
// Atelier beta — 서비스에 쌓인 베타 피드백을 하루 한 번 GitHub 이슈(요약 1건)로 옮긴다.
// 서비스 계약: GET {SERVICE_URL}/api/feedback → { items: [{id, kind, message, page, created_at}] }
//              POST {SERVICE_URL}/api/feedback/ack {upTo} → 옮긴 것까지 표시 (Authorization: Bearer FEEDBACK_TOKEN)
// 환경변수: SERVICE_URL, FEEDBACK_TOKEN, GH_TOKEN, REPO(owner/name). 선택: FEEDBACK_LABELS (쉼표, 기본 "feedback,dept:support"), SERVICE_NAME (이슈 제목 앞 [이름] — 저장소 하나에 서비스가 여럿일 때)
// 의존성 없음 (Node 22+).
import { pathToFileURL } from 'node:url';

export const KIND_LABEL = { good: '좋아요', hard: '불편해요', bug: '오류', idea: '제안' };

// 이용자가 쓴 글을 이슈에 옮길 때: 표 깨짐·멘션(@사람 호출)·HTML 을 막는다
export function cell(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '&#64;')
    .replace(/\|/g, '&#124;')
    .replace(/`/g, '&#96;')
    .replace(/\r?\n/g, '<br>');
}

export function buildIssue(items, { date = new Date().toISOString().slice(0, 10), product = '' } = {}) {
  const counts = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`)
    .join(' · ');
  const rows = items.map((i) => `| ${i.id} | ${KIND_LABEL[i.kind] ?? cell(i.kind)} | ${cell(i.page)} | ${cell(i.created_at?.slice(0, 16).replace('T', ' '))} | ${cell(i.message) || '—'} |`);
  return {
    title: `${product ? `[${product}] ` : ''}베타 피드백 ${date} (${items.length}건)`, // 저장소 하나에 서비스가 여럿이면 SERVICE_NAME 으로 구분
    body: [
      `서비스 "의견 보내기"로 들어온 익명 의견입니다. ${summary}`,
      '',
      '| # | 종류 | 화면 | 시각(UTC) | 내용 |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      '### 처리 (고객지원 부서)',
      '- 오류 → 재현 정리해 `dept:qa` 이슈, 제안 → `dept:plan` 이슈, 불편 → 빈도 표(docs/beta.md)에 합산',
      '- 다 옮기면 이 이슈를 닫는다',
      '',
      '<!-- atelier:feedback -->',
    ].join('\n'),
  };
}

export async function sync({ env = process.env, fetchImpl = fetch, apiBase = 'https://api.github.com', log = console.log } = {}) {
  const { SERVICE_URL, FEEDBACK_TOKEN, GH_TOKEN, REPO } = env;
  if (!SERVICE_URL || !FEEDBACK_TOKEN) {
    log('SERVICE_URL / FEEDBACK_TOKEN 이 없어 건너뜁니다.');
    return { skipped: true };
  }
  const base = SERVICE_URL.replace(/\/$/, '');
  const auth = { authorization: `Bearer ${FEEDBACK_TOKEN}`, 'content-type': 'application/json' };
  const res = await fetchImpl(`${base}/api/feedback`, { headers: auth });
  if (!res.ok) throw new Error(`피드백 조회 실패: HTTP ${res.status}`);
  const { items = [] } = await res.json();
  if (!items.length) {
    log('새 피드백 없음');
    return { created: 0 };
  }
  const gh = (path, init = {}) =>
    fetchImpl(`${apiBase}/repos/${REPO}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${GH_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
    });
  const labels = (env.FEEDBACK_LABELS ?? 'feedback,dept:support').split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of labels) await gh('/labels', { method: 'POST', body: JSON.stringify({ name, color: name === 'feedback' ? 'fbca04' : 'ededed' }) }); // 이미 있으면 422 — 무시
  const issue = buildIssue(items, { product: env.SERVICE_NAME });
  const created = await gh('/issues', { method: 'POST', body: JSON.stringify({ ...issue, labels }) });
  if (!created.ok) throw new Error(`이슈 만들기 실패: HTTP ${created.status}`);
  const { html_url } = await created.json();
  // 이슈가 만들어진 뒤에만 표시한다 — 실패하면 다음 실행에 다시 옮긴다
  const upTo = Math.max(...items.map((i) => i.id));
  const ack = await fetchImpl(`${base}/api/feedback/ack`, { method: 'POST', headers: auth, body: JSON.stringify({ upTo }) });
  if (!ack.ok) throw new Error(`ack 실패: HTTP ${ack.status} (이슈는 만들어짐: ${html_url})`);
  log(`피드백 ${items.length}건 → ${html_url}`);
  return { created: items.length, url: html_url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sync().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
