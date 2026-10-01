#!/usr/bin/env node
// 저장소(플러그인·라이브러리·오픈소스) 방문 통계 — GitHub Traffic 을 매일 모아 운영 통계 형식(ops-stats)으로 쌓는다.
// GitHub 은 최근 14일만 보여 주므로 매일 모아 두지 않으면 사라진다. 그래서 이전 파일과 날짜별로 합쳐 90일을 남긴다.
//   GITHUB_REPOSITORY=owner/repo STATS_PAT=<토큰> node repo-traffic.mjs <이전·출력 파일(traffic.json)>
// 토큰: fine-grained PAT, 그 저장소 하나만, 권한 "Administration: Read-only" (Traffic 은 이 권한이 필요하다).
// 출력은 집계 숫자뿐(방문자 개인 정보 없음). 본부 데이터 부서가 이 파일을 읽어 "운영 지표"에 그린다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const KEEP_DAYS = 90;
const SHOW_DAYS = 30;
// 클론은 넣지 않는다 — 자동 점검(CI)이 push 마다 저장소를 받아 가는 것까지 세어져 사용자 지표가 아니다
export const SERIES = { visitors: '저장소 방문자', views: '저장소 조회', stars: '새 스타' };

const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);

// GitHub 응답들 → 날짜별 행. GitHub Traffic 의 timestamp 는 UTC 자정 기준 하루다(한국 날짜로 옮기지 않고 그 날짜를 쓴다).
export function rowsFrom({ views, stargazers = [] }) {
  const byDate = {};
  const at = (d) => (byDate[d] ??= { date: d });
  for (const v of views?.views ?? []) Object.assign(at(v.timestamp.slice(0, 10)), { views: v.count, visitors: v.uniques });
  for (const s of stargazers) if (s.starred_at) { const r = at(kstDate(s.starred_at)); r.stars = (r.stars ?? 0) + 1; }
  return byDate;
}

// 이전 days 와 새 행을 날짜별로 합친다 — 새 값이 있으면 새 값(GitHub 이 그날 숫자를 늦게 확정하기도 한다), 90일만 남긴다.
export function merge(prevDays = [], fresh = {}, today = new Date().toISOString().slice(0, 10)) {
  const all = Object.fromEntries(prevDays.map((r) => [r.date, { ...r }]));
  for (const [d, r] of Object.entries(fresh)) all[d] = { ...(all[d] ?? { date: d }), ...r };
  const cut = new Date(Date.parse(today) - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  // 빈 날도 0 으로 채워 그래프가 끊기지 않게 (가장 이른 날 ~ 오늘)
  const dates = Object.keys(all).filter((d) => d >= cut).sort();
  if (!dates.length) return [];
  const out = [];
  for (let t = Date.parse(dates[0]); t <= Date.parse(today); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const r = all[d] ?? { date: d };
    out.push(Object.fromEntries([['date', d], ...Object.keys(SERIES).map((k) => [k, Number(r[k]) || 0])]));
  }
  return out;
}

export function build(prev, gh, now = new Date()) {
  const days = merge(prev?.history ?? prev?.days ?? [], rowsFrom(gh), now.toISOString().slice(0, 10));
  const sources = Object.fromEntries((gh.referrers ?? []).map((r) => [r.referrer, r.uniques]));
  return {
    at: now.toISOString(),
    kind: 'repo',
    note: 'GitHub Traffic (최근 14일을 매일 모아 90일 보관). visitors = 고유 방문자',
    series: SERIES,
    days: days.slice(-SHOW_DAYS),
    sources,
    totals: { 스타: gh.repo?.stargazers_count ?? null, 포크: gh.repo?.forks_count ?? null, '최근 14일 방문자': gh.views?.uniques ?? null, '최근 14일 조회': gh.views?.count ?? null },
    history: days,
  };
}

async function main([file = 'traffic.json']) {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.STATS_PAT;
  if (!repo || !token) {
    console.log('STATS_PAT 이 없어 건너뜀 — 저장소 Settings → Secrets → Actions 에 STATS_PAT(Administration: Read-only) 을 넣으면 매일 모아요');
    return 0;
  }
  const get = async (path, accept = 'application/vnd.github+json') => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers: { authorization: `Bearer ${token}`, accept, 'user-agent': 'atelier-repo-traffic' } });
    if (!r.ok) throw new Error(`${path} → ${r.status} (토큰 권한: 이 저장소의 Administration: Read-only 가 필요)`);
    return r.json();
  };
  const [views, referrers, info, stargazers] = await Promise.all([
    get('/traffic/views'), get('/traffic/popular/referrers'), get(''),
    get('/stargazers?per_page=100', 'application/vnd.github.star+json').catch(() => []),
  ]);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const out = build(prev, { views, referrers, repo: info, stargazers });
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`${file}: ${out.days.length}일, 최근 14일 방문자 ${views.uniques}, 조회 ${views.count}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
