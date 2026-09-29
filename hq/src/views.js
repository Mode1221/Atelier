// 화면. 모든 외부·사용자 문자열은 esc() 를 거친다. 폼은 JS 없이 동작한다.
import { DEPTS, COLUMNS } from './company.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const deptName = (id) => DEPTS.find((d) => d.id === id)?.name ?? '미지정';
const usd = (n) => `$${(n ?? 0).toFixed(2)}`;
const krw = (n, rate) => `약 ${Math.round((n ?? 0) * rate).toLocaleString('ko-KR')}원`;

export function ago(iso) {
  if (!iso) return '기록 없음';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

const ICON = {
  good: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="var(--st-good)"/><path d="M6 10.5l2.5 2.5L14 7.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l8.6 15.4H1.4z" fill="var(--st-warning)"/><path d="M10 7v5" stroke="#1a1a19" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.2" fill="#1a1a19"/></svg>',
  critical: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="var(--st-critical)"/><path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  idle: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="var(--ink-muted)" stroke-width="2"/></svg>',
};
const LEVEL_LABEL = { good: '정상', warning: '확인 필요', critical: '문제', idle: '기록 없음' };
export const badge = (level, label = LEVEL_LABEL[level]) => `<span class="badge badge-${level}">${ICON[level]}<span>${esc(label)}</span></span>`;

const help = (text) => `<details class="help"><summary>이게 뭐예요?</summary><p>${text}</p></details>`;

const NAV = [
  ['/', '홈'],
  ['/approvals', '결재'],
  ['/board', '업무'],
  ['/depts', '부서'],
  ['/connect', '연결'],
  ['/settings', '설정'],
];

function layout({ title, s, path, ok, err, body, bare = false }) {
  const nav = bare
    ? ''
    : `<nav class="nav" aria-label="주 메뉴">${NAV.map(([href, label]) => `<a href="${href}"${path === href || (href !== '/' && path.startsWith(href)) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${s ? ` — ${esc(s.company)}` : ''} · Atelier HQ</title>
<meta name="robots" content="noindex"><link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/app.css"><script src="/static/app.js" defer></script></head>
<body>${
    bare
      ? ''
      : `<header class="top"><div class="wrap top-in"><a class="brand" href="/">${esc(s.company)} <span>본부</span></a>
<div class="top-actions"><a href="/help">도움말</a><form method="post" action="/logout"><button class="link">로그아웃</button></form></div></div>${nav}</header>`
  }
<main class="wrap" id="main">
${ok ? `<p class="flash flash-ok" role="status">${badge('good', '완료')} ${esc(ok)}</p>` : ''}
${err ? `<p class="flash flash-err" role="alert">${badge('critical', '안내')} ${esc(err)}</p>` : ''}
${body}</main></body></html>`;
}

// --- 첫 설정·로그인
export const setupPage = ({ err, needCode, locked }) =>
  layout({
    title: '회사 만들기',
    bare: true,
    err,
    body: `<section class="card narrow"><h1>AI 회사를 만들어요</h1>
<p class="muted">대표님은 결재만 하세요. 기획·디자인·개발·QA·마케팅·고객지원 부서는 AI 가 맡아요.</p>
${locked ? `<p>${badge('critical', '잠김')} 서버에 설정 코드(HQ_SECRET 과 별도인 HQ_SETUP_CODE)가 없어 첫 설정을 막았어요. 배포 설정을 확인해 주세요.</p>` : ''}
<form method="post" action="/setup" class="stack">
${needCode ? '<label>설정 코드 (배포할 때 정한 코드)<input name="code" type="password" required autocomplete="off"></label>' : ''}
<label>회사 이름<input name="company" required maxlength="40" placeholder="예: 벌금장부 컴퍼니"></label>
<label>대표 비밀번호 (10자 이상)<input name="password" type="password" required minlength="10" autocomplete="new-password"></label>
<label>비밀번호 한 번 더<input name="password2" type="password" required minlength="10" autocomplete="new-password"></label>
<button class="primary">회사 만들기</button></form></section>`,
  });

export const loginPage = ({ err }) =>
  layout({
    title: '로그인',
    bare: true,
    err,
    body: `<section class="card narrow"><h1>본부 들어가기</h1>
<form method="post" action="/login" class="stack"><label>대표 비밀번호<input name="password" type="password" required autocomplete="current-password" autofocus></label>
<button class="primary">들어가기</button></form></section>`,
  });

// --- 홈
function onboarding(connected) {
  const steps = [
    ['github', 'GitHub 연결', '부서들이 일을 주고받는 업무 보드예요.', '/connect/github'],
    ['anthropic', 'Claude 연결', 'AI 부서들이 일할 때 쓰는 키예요.', '/connect/anthropic'],
    ['bootstrap', '회사 세우기', '부서 일정·라벨을 GitHub 에 자동으로 설치해요.', '/connect#bootstrap'],
  ];
  return `<section class="card"><h1>시작하기</h1><p class="muted">세 단계만 하면 부서들이 스스로 일하기 시작해요.</p>
<ol class="steps">${steps
    .map(([id, name, desc, href]) => `<li class="${connected.has(id) ? 'done' : ''}">${connected.has(id) ? badge('good', '완료') : badge('idle', '할 일')}<div><a href="${href}"><strong>${name}</strong></a><p class="muted">${desc}</p></div></li>`)
    .join('')}</ol></section>`;
}

const tile = (label, value, sub = '', level = null) =>
  `<div class="tile"><p class="tile-label">${esc(label)}</p><p class="tile-value">${value}</p>${level ? badge(level) : ''}${sub ? `<p class="tile-sub">${sub}</p>` : ''}</div>`;

function meter(spent, budget) {
  const r = budget > 0 ? spent / budget : 0;
  const level = r >= 1 ? 'critical' : r >= 0.8 ? 'warning' : 'good';
  return `<div class="meter meter-${level}" role="img" aria-label="예산 ${budget > 0 ? Math.round(r * 100) : 0}% 사용"><span class="w-${Math.min(100, Math.round(r * 20) * 5)}"></span></div>`;
}

function approvalCard(a, { full = false } = {}) {
  return `<article class="card approval">
<p class="approval-meta"><span class="chip">${esc(deptName(a.dept))}</span>${a.kind ? `<span class="chip chip-kind">${esc(a.kind)}</span>` : ''}<span class="muted">#${a.number} · ${ago(a.since)}</span></p>
<${full ? 'h2' : 'h3'} class="approval-title">${esc(a.summary || a.title)}</${full ? 'h2' : 'h3'}>
${a.amount && a.amount !== '없음' ? `<p><strong>금액</strong> ${esc(a.amount)}</p>` : ''}
${full && a.ifApproved ? `<p><strong>승인하면</strong> ${esc(a.ifApproved)}</p>` : ''}
${full && a.ifRejected ? `<p><strong>반려하면</strong> ${esc(a.ifRejected)}</p>` : ''}
<div class="approval-actions">
<form method="post" action="/approvals/${a.number}/approve"><button class="primary" data-confirm="이 일을 승인할까요?">승인</button></form>
<details class="reject"><summary class="btn">반려</summary><form method="post" action="/approvals/${a.number}/reject" class="stack">
<label>반려 이유 (담당 부서가 보고 고쳐요)<textarea name="reason" required maxlength="1000" rows="2"></textarea></label><button class="danger">반려하기</button></form></details>
<a class="btn-link" href="${esc(a.url)}" target="_blank" rel="noopener">원문 보기</a></div></article>`;
}

export function homePage({ s, co, services, spend, status, connected, lastRuns, board, path, ok, err }) {
  const needSetup = !connected.has('github') || !connected.has('anthropic') || !s.bootstrappedAt;
  connected = new Set(connected);
  if (s.bootstrappedAt) connected.add('bootstrap');
  let body = '';
  if (!co.connected) {
    body = onboarding(connected);
    return layout({ title: '홈', s, path, ok, err, body });
  }
  body += `<section class="hero hero-${status.level}" aria-labelledby="status-h">${ICON[status.level]}<div><p class="hero-label">오늘 회사 상태</p><h1 id="status-h">${status.headline}</h1>
${status.reasons.length ? `<ul class="reasons">${status.reasons.map((r) => `<li>${badge(r.level)} ${esc(r.text)}</li>`).join('')}</ul>` : '<p class="muted">결재할 것도, 문제도 없어요.</p>'}</div></section>`;
  if (needSetup) body += onboarding(connected);

  const doing = board ? board.doing.length + board.review.length : 0;
  const svcBad = services.filter((x) => x.error || (x.summary && x.summary.level !== 'good')).length;
  const stripe = services.find((x) => x.id === 'stripe')?.summary;
  const sentry = services.find((x) => x.id === 'sentry')?.summary;
  const aiSpent = spend.orgCost ?? spend.runsTotal;
  body += `<section aria-labelledby="kpi-h"><h2 id="kpi-h" class="sr-only">핵심 숫자</h2><div class="tiles">
${tile('결재 대기', `${co.approvals.length}건`, co.approvals.length ? '<a href="/approvals">결재하러 가기</a>' : '없음')}
${tile('진행 중인 일', `${doing}건`, `할 일 ${board?.todo.length ?? 0}건 대기`)}
${tile('이번 달 AI 사용료', usd(aiSpent), `${krw(aiSpent, s.rate)}${spend.orgCost != null ? ' · Claude 조직 전체' : ' · 부서 실행 합계'}`)}
${services.length ? tile('서비스 상태', svcBad ? `${svcBad}곳 확인` : '정상', `연결된 서비스 ${services.length}개`) : ''}
${stripe ? tile('월 반복 매출', `${Math.round(stripe.value).toLocaleString('ko-KR')} ${esc(stripe.currency)}`, '구독 결제 기준') : ''}
${sentry ? tile('최근 24시간 오류', `${sentry.value}종류`, sentry.value ? '운영·개발 부서가 확인해요' : '깨끗해요') : ''}
</div><p class="tiny muted">부서 AI 예산: ${usd(spend.runsTotal)} 사용 / ${usd(spend.budgetTotal)}</p>${meter(spend.runsTotal, spend.budgetTotal)}</section>`;
  const metricItems = services.find((x) => x.id === 'metrics')?.summary?.items;
  if (metricItems?.length)
    body += `<section aria-labelledby="m-h"><h2 id="m-h">서비스 지표</h2><div class="tiles">${metricItems.map((i) => tile(i.label, i.value.toLocaleString('ko-KR'))).join('')}</div></section>`;

  if (co.approvals.length)
    body += `<section aria-labelledby="ap-h"><div class="sec-head"><h2 id="ap-h">결재함</h2><a href="/approvals">전체 ${co.approvals.length}건</a></div>
${help('부서가 대표님 허락 없이는 할 수 없는 일(배포, 외부 게시, 돈 쓰는 일, 약관)을 여기로 올려요. 승인하면 담당 부서가 바로 진행하고, 반려하면 이유를 보고 고쳐요.')}
${co.approvals.slice(0, 3).map((a) => approvalCard(a)).join('')}</section>`;

  const tasks = co.humanTasks.filter((t) => !t.done);
  body += `<section aria-labelledby="todo-h"><h2 id="todo-h">대표님이 할 일</h2>
${help('AI 가 대신할 수 없는 일이에요. 계정 만들기, 결제 수단 등록, 실제 사용자 만나기 같은 것들이죠. 끝내면 "완료"를 눌러 주세요.')}
${co.stage ? `<p class="muted">프로젝트 진행: ${esc(co.stage)}</p>` : ''}
${tasks.length ? `<ul class="list">${tasks.slice(0, 8).map((t) => `<li><span>${esc(t.text)}</span><form method="post" action="/tasks/done"><input type="hidden" name="text" value="${esc(t.text)}"><button data-confirm="완료로 표시할까요?">완료</button></form></li>`).join('')}</ul>` : '<p class="muted">지금은 없어요.</p>'}</section>`;

  if (services.length)
    body += `<section aria-labelledby="svc-h"><h2 id="svc-h">서비스</h2><ul class="list">${services
      .map((x) => `<li><div><strong>${esc(x.name)}</strong><p class="muted">${esc(x.error ?? x.summary?.headline ?? '')}</p></div>${x.error ? badge('warning', '확인 실패') : x.summary ? badge(x.summary.level) : ''}</li>`)
      .join('')}</ul></section>`;

  body += `<section aria-labelledby="dept-h"><div class="sec-head"><h2 id="dept-h">부서</h2><a href="/depts">자세히</a></div><div class="dept-grid">${DEPTS.map((d) => {
    const r = lastRuns[d.id];
    const level = !r ? 'idle' : r.status === 'success' ? 'good' : r.status === 'failure' ? 'critical' : 'warning';
    return `<div class="dept"><strong>${d.name}</strong>${badge(level, !r ? '아직 안 함' : level === 'good' ? '정상' : level === 'critical' ? '실패' : '확인')}${r ? `<span class="tiny muted">${ago(r.at)}</span>` : ''}</div>`;
  }).join('')}</div></section>`;
  return layout({ title: '홈', s, path, ok, err, body });
}

export function approvalsPage({ s, co, path, ok, err }) {
  const body = !co.connected
    ? '<p>먼저 <a href="/connect/github">GitHub 를 연결</a>해 주세요.</p>'
    : `<h1>결재함</h1>${help('승인하면 담당 부서가 그 일을 진행해요. 반려하면 적어 주신 이유를 보고 부서가 다시 준비해요. 원문 보기를 누르면 부서가 남긴 자세한 기록을 볼 수 있어요.')}
${co.githubError ? `<p class="flash flash-err">${esc(co.githubError)}</p>` : ''}
${co.approvals.length ? co.approvals.map((a) => approvalCard(a, { full: true })).join('') : `<div class="empty">${badge('good', '없음')}<p>결재할 일이 없어요.</p></div>`}`;
  return layout({ title: '결재', s, path, ok, err, body });
}

export function boardPage({ s, co, board, path, ok, err }) {
  const form = `<details class="card"><summary><strong>새 일 맡기기</strong></summary><form method="post" action="/board/new" class="stack">
<label>무엇을 해야 하나요?<input name="title" required maxlength="200" placeholder="예: 가입 화면에 카카오 로그인 추가"></label>
<label>자세한 설명 (선택)<textarea name="body" rows="3" maxlength="5000" placeholder="왜 필요한지, 어떻게 되면 끝인지"></textarea></label>
<label>맡길 부서<select name="dept">${DEPTS.map((d) => `<option value="${d.id}"${d.id === 'plan' ? ' selected' : ''}>${d.name} — ${d.role}</option>`).join('')}</select></label>
<button class="primary">맡기기</button><p class="tiny muted">잘 모르겠으면 기획 부서에 맡기세요. 알아서 나눠서 넘겨요.</p></form></details>`;
  const body = !board
    ? `<h1>업무 보드</h1><p>${co.githubError ? esc(co.githubError) : '먼저 <a href="/connect/github">GitHub 를 연결</a>해 주세요.'}</p>`
    : `<h1>업무 보드</h1>${help('부서들이 하고 있는 일이에요. 왼쪽에서 오른쪽으로 진행돼요. 제목을 누르면 GitHub 에서 부서 간 대화를 볼 수 있어요.')}${form}
<div class="board">${COLUMNS.map((col) => `<section class="col" aria-labelledby="col-${col.id}"><h2 id="col-${col.id}">${col.name} <span class="count">${board[col.id].length}</span></h2>
${board[col.id].length ? board[col.id].map((i) => `<a class="task${i.alert ? ' task-alert' : ''}" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="chip">${esc(deptName(i.dept))}</span><span>${esc(i.title)}</span><span class="tiny muted">#${i.number} · ${ago(i.updated)}</span></a>`).join('') : '<p class="tiny muted">없음</p>'}</section>`).join('')}</div>`;
  return layout({ title: '업무', s, path, ok, err, body });
}

export function deptsPage({ s, co, spend, lastRuns, runs, path, ok, err }) {
  const openBy = {};
  for (const i of co.issues ?? []) if (i.state === 'open') for (const l of i.labels ?? []) if ((l.name ?? l).startsWith('dept:')) openBy[(l.name ?? l).slice(5)] = (openBy[(l.name ?? l).slice(5)] ?? 0) + 1;
  const cards = DEPTS.map((d) => {
    const r = lastRuns[d.id];
    const spent = spend.perDept[d.id]?.usd ?? 0;
    const budget = s.budgets[d.id];
    const paused = s.paused.includes(d.id);
    const level = paused ? 'idle' : !r ? 'idle' : r.status === 'success' ? 'good' : r.status === 'failure' ? 'critical' : 'warning';
    return `<article class="card dept-card"><div class="sec-head"><h2>${d.name}</h2>${badge(level, paused ? '쉬는 중' : !r ? '아직 안 함' : { good: '정상', critical: '실패', warning: '확인' }[level])}</div>
<p>${d.role}</p><p class="tiny muted">일하는 때: ${d.when} · 맡은 일 ${openBy[d.id] ?? 0}건 · 마지막 실행 ${ago(r?.at)}${r?.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">기록</a>` : ''}</p>
<p class="tiny">이번 달 ${usd(spent)} / 예산 ${usd(budget)}</p>${meter(spent, budget)}
<div class="row"><form method="post" action="/depts/${d.id}/run"><button${paused ? ' disabled' : ''} data-confirm="${d.name} 부서를 지금 실행할까요? AI 사용료가 들어요.">지금 일하기</button></form>
<form method="post" action="/depts/${d.id}/pause"><button class="quiet">${paused ? '다시 시작' : '쉬게 하기'}</button></form></div></article>`;
  }).join('');
  const table = runs.length
    ? `<table><caption>최근 부서 실행</caption><thead><tr><th>부서</th><th>결과</th><th class="num">비용</th><th>언제</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${esc(deptName(r.dept))}</td><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.status)}</a>` : esc(r.status)}</td><td class="num">${usd(r.cost_usd)}</td><td>${ago(r.at)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">아직 실행 기록이 없어요. "회사 세우기" 후 부서가 일하면 여기에 쌓여요.</p>';
  return layout({ title: '부서', s, path, ok, err, body: `<h1>부서</h1>${help('각 부서는 정해진 때에 스스로 일해요. 할 일이 없으면 건너뛰어 비용이 들지 않아요. 예산을 다 쓰면 그 달에는 멈춰요. 예산은 설정에서 바꿀 수 있어요.')}<div class="dept-cards">${cards}</div>${table}` });
}

// --- 연결
export function connectPage({ s, services, connected, path, ok, err }) {
  const ready = connected.has('github') && connected.has('anthropic');
  const cards = services
    .map((svc) => `<li class="card svc"><div><h2 class="svc-title">${esc(svc.name)} ${svc.required ? '<span class="chip chip-kind">필수</span>' : '<span class="chip">선택</span>'}</h2><p class="muted">${esc(svc.purpose)}</p>
${connected.has(svc.id) ? `<p class="tiny muted">연결: ${ago(connected.get(svc.id))}</p>` : ''}</div>
<div class="svc-side">${connected.has(svc.id) ? badge('good', '연결됨') : badge('idle', '연결 안 됨')}<a class="btn" href="/connect/${svc.id}">${connected.has(svc.id) ? '바꾸기' : '연결하기'}</a></div></li>`)
    .join('');
  const body = `<h1>연결</h1>${help('회사가 쓰는 외부 서비스를 연결해요. 키는 이 본부 서버에 암호화되어 저장되고, 화면에 다시 보여 주지 않아요.')}
<ul class="plain">${cards}</ul>
<section class="card" id="bootstrap"><h2>회사 세우기</h2>
<p>GitHub 에 부서 일정·업무 라벨·AI 키를 자동으로 설치해요. 처음 한 번, 그리고 키를 바꿨을 때 눌러 주세요.</p>
${s.bootstrappedAt ? `<p class="tiny muted">마지막 설치: ${ago(s.bootstrappedAt)}</p>` : ''}
${!s.publicUrl || /localhost|127\.0\.0\.1/.test(s.publicUrl) ? `<p class="tiny">${badge('warning', '참고')} 본부 주소가 ${esc(s.publicUrl || '없음')} 이라 GitHub 가 실행 기록을 보낼 수 없어요. 인터넷 주소로 배포했다면 설정에서 바꿔 주세요.</p>` : ''}
<form method="post" action="/company/bootstrap"><button class="primary"${ready ? '' : ' disabled'} data-confirm="GitHub 저장소에 회사 설정을 설치할까요?">회사 세우기</button></form>
${ready ? '' : '<p class="tiny muted">GitHub 와 Claude 를 먼저 연결해 주세요.</p>'}
<details class="help"><summary>고급: 연결 토큰 새로 만들기</summary><p>GitHub 가 본부에 실행 기록을 보낼 때 쓰는 토큰이에요. 유출이 의심되면 새로 만든 뒤 "회사 세우기"를 다시 눌러요.</p>
<form method="post" action="/settings/rotate-token"><button class="quiet" data-confirm="토큰을 새로 만들까요?">새 토큰 만들기</button></form></details></section>`;
  return layout({ title: '연결', s: { ...s, bootstrappedAt: s.bootstrappedAt }, path, ok, err, body });
}

export function connectServicePage({ s, svc, cur, path, ok, err }) {
  const fields = svc.fields
    .map((f) => {
      const has = !!cur[f.key];
      const input = f.multiline
        ? `<textarea name="${f.key}" rows="3" placeholder="${esc(f.placeholder)}">${esc(cur[f.key] ?? '')}</textarea>`
        : `<input name="${f.key}" ${f.secret ? 'type="password" autocomplete="off"' : 'type="text"'} placeholder="${esc(f.secret && has ? '저장됨 — 바꾸려면 새로 입력' : f.placeholder)}" value="${f.secret ? '' : esc(cur[f.key] ?? '')}"${!f.optional && !(f.secret && has) ? ' required' : ''}>`;
      return `<label>${esc(f.label)}${f.optional ? ' <span class="muted">(선택)</span>' : ''}${input}</label>`;
    })
    .join('');
  const body = `<p><a href="/connect">← 연결</a></p><h1>${esc(svc.name)}</h1><p>${esc(svc.purpose)}</p>
<section class="card"><h2>키 받는 법</h2><ol>${svc.howTo.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></section>
<form method="post" action="/connect/${svc.id}" class="card stack">${fields}<button class="primary">연결 확인하고 저장</button>
<p class="tiny muted">저장 전에 실제로 접속해 확인해요. 키는 암호화해서 저장해요.</p></form>
${Object.keys(cur).length ? `<form method="post" action="/connect/${svc.id}/remove"><button class="danger" data-confirm="연결을 해제할까요?">연결 해제</button></form>` : ''}`;
  return layout({ title: svc.name, s, path, ok, err, body });
}

// --- 설정·도움말
export function settingsPage({ s, audit, path, ok, err }) {
  const ACTION = { setup: '회사 만들기', connect: '서비스 연결', disconnect: '연결 해제', approve: '승인', reject: '반려', run: '부서 실행', pause: '부서 쉬기', resume: '부서 재개', settings: '설정 변경', password: '비밀번호 변경', bootstrap: '회사 세우기', task: '일 맡기기', human_task_done: '할 일 완료', rotate_token: '토큰 교체' };
  const body = `<h1>설정</h1>
<form method="post" action="/settings" class="card stack"><h2>회사</h2>
<label>회사 이름<input name="company" value="${esc(s.company)}" maxlength="40"></label>
<label>본부 주소 (GitHub 가 실행 기록을 보낼 곳)<input name="publicUrl" value="${esc(s.publicUrl)}" placeholder="https://hq.example.com"></label>
<label>환율 (1달러 = 원)<input name="rate" type="number" min="1" max="99999" value="${esc(s.rate)}"></label>
<h2>부서별 월 AI 예산 (달러)</h2>${help('부서가 한 달에 쓸 수 있는 AI 사용료 상한이에요. 다 쓰면 그 부서는 다음 달까지 멈춰요. 보통 하루 한 번 일하는 부서는 한 달에 몇 달러 정도예요(업무량에 따라 달라요).')}
<div class="budget-grid">${DEPTS.map((d) => `<label>${d.name}<input name="budget_${d.id}" type="number" min="0" max="10000" step="1" value="${esc(s.budgets[d.id])}"></label>`).join('')}</div>
<button class="primary">저장</button></form>
<form method="post" action="/settings/password" class="card stack"><h2>비밀번호 바꾸기</h2>
<label>지금 비밀번호<input name="current" type="password" required autocomplete="current-password"></label>
<label>새 비밀번호 (10자 이상)<input name="password" type="password" required minlength="10" autocomplete="new-password"></label>
<label>새 비밀번호 한 번 더<input name="password2" type="password" required minlength="10" autocomplete="new-password"></label>
<button>바꾸기</button></form>
<section class="card"><h2>최근 기록</h2>${audit.length ? `<ul class="list">${audit.map((a) => `<li><span>${esc(ACTION[a.action] ?? a.action)}</span><span class="tiny muted">${ago(a.at)}</span></li>`).join('')}</ul>` : '<p class="muted">없음</p>'}</section>`;
  return layout({ title: '설정', s, path, ok, err, body });
}

export function helpPage({ s, path, ok, err }) {
  const terms = [
    ['결재', '부서가 대표님 허락을 받아야 하는 일이에요. 배포(새 버전을 사용자에게 내보내기), 외부 게시, 돈 쓰는 일, 약관 변경이 여기 속해요.'],
    ['부서', 'AI 직원 팀이에요. 정해진 시간에 GitHub 에서 자기 일을 가져가 처리하고, 결과를 다시 GitHub 에 남겨요.'],
    ['업무 보드', '누가 무슨 일을 하고 있는지 보여 주는 칸반이에요. GitHub 이슈로 만들어져요.'],
    ['GitHub', '코드와 업무 기록을 보관하는 곳이에요. 부서들의 사무실이라고 생각하면 돼요.'],
    ['토큰·키', '외부 서비스에 들어가는 열쇠예요. 비밀번호처럼 남에게 보여 주면 안 돼요.'],
    ['예산', '부서가 한 달에 쓸 수 있는 AI 사용료 상한이에요.'],
    ['배포', '만든 기능을 실제 사용자가 쓸 수 있게 내보내는 일이에요.'],
    ['PR (풀 리퀘스트)', '개발 부서가 "이렇게 고쳤어요" 하고 올리는 변경 묶음이에요. QA 부서가 검사해요.'],
    ['상태 확인 주소', '서비스가 살아 있는지 알려 주는 주소예요. 보통 /health 로 끝나요.'],
  ];
  const body = `<h1>도움말</h1><section class="card"><h2>하루 사용법</h2><ol>
<li>홈에서 <strong>오늘 회사 상태</strong>를 봐요. 초록이면 할 일 없어요.</li>
<li><strong>결재함</strong>에 뭐가 있으면 읽고 승인하거나 이유를 적어 반려해요.</li>
<li><strong>대표님이 할 일</strong>이 있으면 처리하고 완료를 눌러요.</li>
<li>시키고 싶은 일이 생기면 <strong>업무 → 새 일 맡기기</strong>.</li></ol></section>
<section class="card"><h2>용어</h2><dl>${terms.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></section>
<section class="card"><h2>하지 않는 일</h2><p>애니메이션·영상 제작, API 가 없는 커뮤니티 자동 게시(약관 위반), 대표 결재 없는 지출·배포·게시는 하지 않아요.</p></section>`;
  return layout({ title: '도움말', s, path, ok, err, body });
}

export const notFoundPage = () => layout({ title: '없는 페이지', bare: true, body: '<section class="card narrow"><h1>없는 페이지예요</h1><p><a href="/">홈으로</a></p></section>' });
export const errorPage = () => layout({ title: '오류', bare: true, body: '<section class="card narrow"><h1>잠시 문제가 생겼어요</h1><p>잠시 후 다시 시도해 주세요. <a href="/">홈으로</a></p></section>' });
