// 화면 (서버 없는 HQ). 모든 외부·사용자 문자열은 esc() 를 거친다.
// 폼은 data-action 으로 main.js 의 처리기와 연결된다. 링크는 #/경로.
import { DEPTS, COLUMNS } from './company.js';
import { SERVICES } from './services.js';
import { CHANNELS, withUtm, postLength } from './channels.js';

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
  ['#/', '홈'],
  ['#/approvals', '결재'],
  ['#/board', '업무'],
  ['#/depts', '부서'],
  ['#/share', '홍보'],
  ['#/connect', '연결'],
  ['#/settings', '설정'],
];

export function chrome({ s, route }) {
  return `<header class="top"><div class="wrap top-in"><a class="brand" href="#/">${esc(s.company)} <span>본부</span></a>
<div class="top-actions"><a href="#/help">도움말</a><button class="link" data-click="logout">로그아웃</button></div></div>
<nav class="nav" aria-label="주 메뉴">${NAV.map(([href, label]) => `<a href="${href}"${route === href.slice(1) || (href !== '#/' && route.startsWith(href.slice(1))) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav></header>`;
}

export const flash = ({ ok, err }) =>
  `${ok ? `<p class="flash flash-ok" role="status">${badge('good', '완료')} ${esc(ok)}</p>` : ''}${err ? `<p class="flash flash-err" role="alert">${badge('critical', '안내')} ${esc(err)}</p>` : ''}`;

// --- 로그인 (GitHub 토큰)
export const loginPage = () => `<section class="card narrow"><h1>Atelier HQ</h1>
<p class="muted">AI 회사 본부예요. 서버 없이 이 브라우저에서만 동작해요 — 토큰은 이 기기에만 저장되고 GitHub 로만 보내요.</p>
<form data-action="login" class="stack">
<label>회사 저장소 (소유자/이름)<input name="repo" required placeholder="Mode1221/my-service" autocomplete="off"></label>
<label>GitHub 접근 토큰<input name="token" type="password" required placeholder="github_pat_…" autocomplete="off"></label>
<label class="check"><input name="remember" type="checkbox"> 이 기기에서 기억하기 (공용 PC 에서는 끄세요)</label>
<button class="primary">들어가기</button></form>
<details class="help"><summary>토큰은 어떻게 만들어요?</summary><ol>
<li>GitHub → Settings → Developer settings → Personal access tokens → <strong>Fine-grained tokens</strong> → Generate new token</li>
<li>Repository access: 회사 저장소 하나만 선택</li>
<li>Permissions 를 "Read and write" 로: Actions, Contents, Issues, Pull requests, Secrets, Workflows</li>
<li>만들어진 토큰(github_pat_…)을 위에 붙여 넣기</li></ol></details></section>`;

// --- 홈
const tile = (label, value, sub = '') => `<div class="tile"><p class="tile-label">${esc(label)}</p><p class="tile-value">${value}</p>${sub ? `<p class="tile-sub">${sub}</p>` : ''}</div>`;
function meter(spent, budget) {
  const r = budget > 0 ? spent / budget : 0;
  const level = r >= 1 ? 'critical' : r >= 0.8 ? 'warning' : 'good';
  return `<div class="meter meter-${level}" role="img" aria-label="예산 ${budget > 0 ? Math.round(r * 100) : 0}% 사용"><span class="w-${Math.min(100, Math.round(r * 20) * 5)}"></span></div>`;
}

function approvalCard(a, { full = false } = {}) {
  const H = full ? 'h2' : 'h3';
  return `<article class="card approval">
<p class="approval-meta"><span class="chip">${esc(deptName(a.dept))}</span>${a.kind ? `<span class="chip chip-kind">${esc(a.kind)}</span>` : ''}<span class="muted">#${a.number} · ${ago(a.since)}</span></p>
<${H} class="approval-title">${esc(a.summary || a.title)}</${H}>
${a.amount && a.amount !== '없음' ? `<p><strong>금액</strong> ${esc(a.amount)}</p>` : ''}
${full && a.ifApproved ? `<p><strong>승인하면</strong> ${esc(a.ifApproved)}</p>` : ''}
${full && a.ifRejected ? `<p><strong>반려하면</strong> ${esc(a.ifRejected)}</p>` : ''}
<div class="approval-actions">
<form data-action="approve" data-n="${a.number}"><button class="primary" data-confirm="이 일을 승인할까요?">승인</button></form>
<details class="reject"><summary class="btn">반려</summary><form data-action="reject" data-n="${a.number}" class="stack">
<label>반려 이유 (담당 부서가 보고 고쳐요)<textarea name="reason" required maxlength="1000" rows="2"></textarea></label><button class="danger">반려하기</button></form></details>
<a class="btn-link" href="${esc(a.url)}" target="_blank" rel="noopener">원문 보기</a></div></article>`;
}

function onboarding({ ready }) {
  const steps = [
    ['github', 'GitHub 연결', '로그인했으니 끝났어요.', '#/'],
    ['anthropic', 'Claude 연결', 'AI 부서들이 일할 때 쓰는 키예요.', '#/connect/anthropic'],
    ['bootstrap', '회사 세우기', '부서 일정·라벨·데이터 보관함을 저장소에 자동으로 설치해요.', '#/connect'],
  ];
  return `<section class="card"><h1>시작하기</h1><p class="muted">세 단계면 부서들이 스스로 일하기 시작해요.</p><ol class="steps">${steps
    .map(([id, name, desc, href]) => `<li>${ready[id] ? badge('good', '완료') : badge('idle', '할 일')}<div><a href="${href}"><strong>${name}</strong></a><p class="muted">${desc}</p></div></li>`)
    .join('')}</ol></section>`;
}

export function homePage({ s, co, status, spend, svc, ready }) {
  let body = '';
  body += `<section class="hero hero-${status.level}" aria-labelledby="status-h">${ICON[status.level]}<div><p class="hero-label">오늘 회사 상태</p><h1 id="status-h">${status.headline}</h1>
${status.reasons.length ? `<ul class="reasons">${status.reasons.map((r) => `<li>${badge(r.level)} ${esc(r.text)}</li>`).join('')}</ul>` : '<p class="muted">결재할 것도, 문제도 없어요.</p>'}</div></section>`;
  if (!ready.anthropic || !ready.bootstrap) body += onboarding({ ready });

  const doing = co.board.doing.length + co.board.review.length;
  const aiSpent = spend.orgCost ?? spend.runsTotal;
  const stripe = svc.stripe?.summary;
  const sentry = svc.sentry?.summary;
  const svcList = Object.entries(svc);
  const svcBad = svcList.filter(([, x]) => x.error || (x.summary && x.summary.level !== 'good')).length;
  body += `<section aria-labelledby="kpi-h"><h2 id="kpi-h" class="sr-only">핵심 숫자</h2><div class="tiles">
${tile('결재 대기', `${co.approvals.length}건`, co.approvals.length ? '<a href="#/approvals">결재하러 가기</a>' : '없음')}
${tile('진행 중인 일', `${doing}건`, `할 일 ${co.board.todo.length}건 대기`)}
${tile('이번 달 AI 사용료', usd(aiSpent), `${krw(aiSpent, s.rate)}${spend.orgCost != null ? ' · Claude 조직 전체' : ' · 부서 실행 합계'}`)}
${svcList.length ? tile('서비스 상태', svcBad ? `${svcBad}곳 확인` : '정상', `연결된 서비스 ${svcList.length}개${co.statusAt ? ` · ${ago(co.statusAt)} 수집` : ''}`) : ''}
${stripe ? tile('월 반복 매출', `${Math.round(stripe.value).toLocaleString('ko-KR')} ${esc(stripe.currency)}`, '구독 결제 기준') : ''}
${sentry ? tile('최근 24시간 오류', `${sentry.value}종류`, sentry.value ? '운영·개발 부서가 확인해요' : '깨끗해요') : ''}
</div><p class="tiny muted">부서 AI 예산: ${usd(spend.runsTotal)} 사용 / ${usd(spend.budgetTotal)}</p>${meter(spend.runsTotal, spend.budgetTotal)}</section>`;

  const metricItems = svc.metrics?.summary?.items;
  if (metricItems?.length) body += `<section aria-labelledby="m-h"><h2 id="m-h">서비스 지표</h2><div class="tiles">${metricItems.map((i) => tile(i.label, Number(i.value).toLocaleString('ko-KR'))).join('')}</div></section>`;

  if (co.approvals.length)
    body += `<section aria-labelledby="ap-h"><div class="sec-head"><h2 id="ap-h">결재함</h2><a href="#/approvals">전체 ${co.approvals.length}건</a></div>
${help('부서가 대표님 허락 없이는 할 수 없는 일(배포, 외부 게시, 돈 쓰는 일, 약관)을 여기로 올려요. 승인하면 담당 부서가 바로 진행하고, 반려하면 이유를 보고 고쳐요.')}
${co.approvals.slice(0, 3).map((a) => approvalCard(a)).join('')}</section>`;

  const tasks = co.humanTasks.filter((t) => !t.done);
  body += `<section aria-labelledby="todo-h"><h2 id="todo-h">대표님이 할 일</h2>
${help('AI 가 대신할 수 없는 일이에요. 계정 만들기, 결제 수단 등록, 실제 사용자 만나기 같은 것들이죠. 끝내면 "완료"를 눌러 주세요.')}
${co.stage ? `<p class="muted">프로젝트 진행: ${esc(co.stage)}</p>` : ''}
${tasks.length ? `<ul class="list">${tasks.slice(0, 8).map((t, i) => `<li><span>${esc(t.text)}</span><form data-action="taskDone" data-i="${i}"><button data-confirm="완료로 표시할까요?">완료</button></form></li>`).join('')}</ul>` : '<p class="muted">지금은 없어요.</p>'}</section>`;

  if (svcList.length)
    body += `<section aria-labelledby="svc-h"><h2 id="svc-h">서비스</h2><ul class="list">${svcList
      .map(([id, x]) => `<li><div><strong>${esc(SERVICES[id]?.name ?? id)}</strong><p class="muted">${esc(x.error ?? x.summary?.headline ?? '')}</p></div>${x.error ? badge('warning', '확인 실패') : badge(x.summary.level)}</li>`)
      .join('')}</ul></section>`;

  body += `<section aria-labelledby="dept-h"><div class="sec-head"><h2 id="dept-h">부서</h2><a href="#/depts">자세히</a></div><div class="dept-grid">${DEPTS.map((d) => {
    const r = spend.last[d.id];
    const level = !r ? 'idle' : r.status === 'success' ? 'good' : r.status === 'failure' ? 'critical' : 'warning';
    return `<div class="dept"><strong>${d.name}</strong>${badge(level, !r ? '아직 안 함' : level === 'good' ? '정상' : level === 'critical' ? '실패' : '확인')}</div>`;
  }).join('')}</div></section>`;
  return body;
}

export const approvalsPage = ({ co }) =>
  `<h1>결재함</h1>${help('승인하면 담당 부서가 그 일을 진행해요. 반려하면 적어 주신 이유를 보고 부서가 다시 준비해요. 원문 보기를 누르면 부서가 남긴 자세한 기록을 볼 수 있어요.')}
${co.approvals.length ? co.approvals.map((a) => approvalCard(a, { full: true })).join('') : `<div class="empty">${badge('good', '없음')}<p>결재할 일이 없어요.</p></div>`}`;

export function boardPage({ co }) {
  const form = `<details class="card"><summary><strong>새 일 맡기기</strong></summary><form data-action="newTask" class="stack">
<label>무엇을 해야 하나요?<input name="title" required maxlength="200" placeholder="예: 가입 화면에 카카오 로그인 추가"></label>
<label>자세한 설명 (선택)<textarea name="body" rows="3" maxlength="5000" placeholder="왜 필요한지, 어떻게 되면 끝인지"></textarea></label>
<label>맡길 부서<select name="dept">${DEPTS.map((d) => `<option value="${d.id}"${d.id === 'plan' ? ' selected' : ''}>${d.name} — ${d.role}</option>`).join('')}</select></label>
<button class="primary">맡기기</button><p class="tiny muted">잘 모르겠으면 기획 부서에 맡기세요. 알아서 나눠서 넘겨요.</p></form></details>`;
  const b = co.board;
  return `<h1>업무 보드</h1>${help('부서들이 하고 있는 일이에요. 왼쪽에서 오른쪽으로 진행돼요. 제목을 누르면 GitHub 에서 부서 간 대화를 볼 수 있어요.')}${form}
<div class="board">${COLUMNS.map((col) => `<section class="col" aria-labelledby="col-${col.id}"><h2 id="col-${col.id}">${col.name} <span class="count">${b[col.id].length}</span></h2>
${b[col.id].length ? b[col.id].map((i) => `<a class="task${i.alert ? ' task-alert' : ''}" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="chip">${esc(deptName(i.dept))}</span><span>${esc(i.title)}</span><span class="tiny muted">#${i.number} · ${ago(i.updated)}</span></a>`).join('') : '<p class="tiny muted">없음</p>'}</section>`).join('')}</div>`;
}

export function deptsPage({ s, co, spend, repo }) {
  const openBy = {};
  for (const i of co.issues) if (i.state === 'open') for (const l of i.labels ?? []) if ((l.name ?? l).startsWith('dept:')) openBy[(l.name ?? l).slice(5)] = (openBy[(l.name ?? l).slice(5)] ?? 0) + 1;
  const cards = DEPTS.map((d) => {
    const r = spend.last[d.id];
    const spent = spend.perDept[d.id]?.usd ?? 0;
    const budget = s.budgets[d.id];
    const paused = s.paused.includes(d.id);
    const level = paused || !r ? 'idle' : r.status === 'success' ? 'good' : r.status === 'failure' ? 'critical' : 'warning';
    return `<article class="card dept-card"><div class="sec-head"><h2>${d.name}</h2>${badge(level, paused ? '쉬는 중' : !r ? '아직 안 함' : { good: '정상', critical: '실패', warning: '확인' }[level])}</div>
<p>${d.role}</p><p class="tiny muted">일하는 때: ${d.when} · 맡은 일 ${openBy[d.id] ?? 0}건${r ? ` · <a href="https://github.com/${esc(repo)}/actions/runs/${esc(r.runId)}" target="_blank" rel="noopener">마지막 실행 기록</a>` : ''}</p>
<p class="tiny">이번 달 ${usd(spent)} / 예산 ${usd(budget)}</p>${meter(spent, budget)}
<div class="row"><form data-action="runDept" data-dept="${d.id}"><button${paused ? ' disabled' : ''} data-confirm="${d.name} 부서를 지금 실행할까요? AI 사용료가 들어요.">지금 일하기</button></form>
<form data-action="togglePause" data-dept="${d.id}"><button class="quiet">${paused ? '다시 시작' : '쉬게 하기'}</button></form></div></article>`;
  }).join('');
  return `<h1>부서</h1>${help('각 부서는 정해진 때에 스스로 일해요. 할 일이 없으면 건너뛰어 비용이 들지 않아요. 예산을 다 쓰면 그 달에는 멈춰요. 예산은 설정에서 바꿀 수 있어요.')}<div class="dept-cards">${cards}</div>`;
}

// --- 연결
export function connectPage({ secrets, ready }) {
  const has = (svc) => svc.secretName(secrets);
  const cards = Object.values(SERVICES)
    .map((svc) => `<li class="card svc"><div><h2 class="svc-title">${esc(svc.name)} ${svc.required ? '<span class="chip chip-kind">필수</span>' : '<span class="chip">선택</span>'}</h2><p class="muted">${esc(svc.purpose)}</p></div>
<div class="svc-side">${has(svc) ? badge('good', '연결됨') : badge('idle', '연결 안 됨')}<a class="btn" href="#/connect/${svc.id}">${has(svc) ? '바꾸기' : '연결하기'}</a></div></li>`)
    .join('');
  return `<h1>연결</h1>${help('회사가 쓰는 외부 서비스를 연결해요. 키는 GitHub 저장소의 비밀값으로 암호화되어 들어가고, 이 화면이나 브라우저에는 남지 않아요. 상태는 3시간마다 자동으로 수집돼요.')}
<ul class="plain">${cards}</ul>
<section class="card" id="bootstrap"><h2>회사 세우기</h2>
<p>저장소에 부서 일정·업무 라벨·데이터 보관함·상태 수집기를 자동으로 설치해요. 처음 한 번, 그리고 Atelier 가 업데이트됐을 때 눌러 주세요.</p>
${ready.bootstrap ? `<p class="tiny muted">${badge('good', '설치됨')}</p>` : ''}
<form data-action="bootstrap"><button class="primary"${ready.anthropic ? '' : ' disabled'} data-confirm="저장소에 회사 설정을 설치할까요?">회사 세우기</button></form>
${ready.anthropic ? '' : '<p class="tiny muted">Claude 를 먼저 연결해 주세요.</p>'}</section>`;
}

export function connectServicePage({ svc, secrets }) {
  const connected = svc.secretName(secrets);
  const fields = svc.fields
    .map((f) => {
      const input = f.multiline
        ? `<textarea name="${f.key}" rows="3" placeholder="${esc(f.placeholder)}"${f.optional ? '' : ' required'}></textarea>`
        : `<input name="${f.key}" ${f.secret ? 'type="password" autocomplete="off"' : 'type="text"'} placeholder="${esc(f.placeholder)}"${f.optional ? '' : ' required'}>`;
      return `<label>${esc(f.label)}${f.optional ? ' <span class="muted">(선택)</span>' : ''}${input}</label>`;
    })
    .join('');
  return `<p><a href="#/connect">← 연결</a></p><h1>${esc(svc.name)}</h1><p>${esc(svc.purpose)}</p>
<section class="card"><h2>키 받는 법</h2><ol>${svc.howTo.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></section>
<form data-action="connect" data-svc="${svc.id}" class="card stack">${connected ? `<p class="tiny">${badge('good', '연결됨')} 바꾸려면 모든 칸을 다시 입력해 주세요 (저장된 키는 다시 보여 주지 않아요).</p>` : ''}${fields}
<button class="primary">${svc.browserTest ? '확인하고 저장' : '저장'}</button>
<p class="tiny muted">${svc.browserTest ? '저장 전에 실제로 접속해 확인해요. ' : '확인은 다음 상태 수집(최대 3시간) 때 돼요. '}키는 GitHub 비밀값으로 암호화돼 들어가요.</p></form>
${connected ? `<form data-action="disconnect" data-svc="${svc.id}"><button class="danger" data-confirm="연결을 해제할까요?">연결 해제</button></form>` : ''}`;
}

// --- 홍보·반응: 채널별 글을 눌러서 올리고(공식 공유 창), 베타 피드백을 본다
export function sharePage({ spec, specErr, sharePath, shared, feedback }) {
  const fb = feedback.length
    ? `<ul class="list">${feedback.map((i) => `<li><a href="${esc(i.html_url)}" target="_blank" rel="noopener">${esc(i.title)}</a> ${i.state === 'open' ? badge('warning', '분류 전') : badge('good', '처리됨')}</li>`).join('')}</ul>`
    : '<p class="muted">아직 들어온 의견이 없어요. 서비스의 "의견 보내기"로 들어온 의견이 매일 여기에 모여요.</p>';
  let posts;
  if (!spec) {
    posts = `<section class="card"><h2>홍보 글이 아직 없어요</h2><p>${specErr ? esc(specErr) : `저장소에 <code>${esc(sharePath)}</code> 파일이 없어요.`}</p>
<form data-action="newTask" class="stack"><input type="hidden" name="dept" value="marketing"><input type="hidden" name="title" value="홍보 글 써 줘 (Atelier share)">
<input type="hidden" name="body" value="${esc(`atelier:share 스킬로 채널별 홍보 글을 ${sharePath} 에 써 주세요. 대상 사용자가 있는 채널 3~5개, 채널별 글쓰기 가이드(references/channel-guide.md)의 말투·길이·금기에 맞춰 채널마다 따로 쓰기.`)}">
<button class="primary">마케팅 부서에 홍보 글 맡기기</button></form></section>`;
  } else {
    posts = spec.posts
      .map((p, i) => {
        const ch = CHANNELS[p.channel];
        if (!ch) return '';
        const url = withUtm(p.url ?? spec.url, p.channel, spec.campaign);
        const posted = shared.has(`${p.channel}#${i}`);
        const n = postLength(p.text, p.channel);
        return `<article class="card"><div class="sec-head"><h2>${esc(ch.name)}</h2>${posted ? badge('good', '올림') : badge('idle', '안 올림')}</div>
${p.when ? `<p class="tiny muted">${esc(p.when)}</p>` : ''}<pre class="post" id="post-${i}">${esc(ch.linkInComment ? p.text : `${p.text}\n${url}`)}</pre>
${ch.linkInComment ? `<p class="tiny">첫 댓글에 넣을 링크: <code id="link-${i}">${esc(url)}</code></p>` : ''}<p class="tiny ${n > ch.limit ? 'err' : 'muted'}">${n} / ${ch.limit}자${ch.note ? ` · ${esc(ch.note)}` : ''}</p>
<div class="row"><button type="button" data-click="copy" data-target="post-${i}">글 복사</button>
${ch.linkInComment ? `<button type="button" data-click="copy" data-target="link-${i}">링크 복사</button>` : ''}
${ch.intent ? `<a class="btn primary" href="${esc(ch.intent(p.text, url))}" target="_blank" rel="noopener">${esc(ch.name)}에 올리기</a>` : ''}
${posted ? '' : `<form data-action="markShared" data-channel="${esc(p.channel)}" data-i="${i}"><button>올렸어요</button></form>`}</div></article>`;
      })
      .join('');
  }
  return `<h1>홍보·반응</h1>
<p class="muted">버튼을 누르면 각 SNS 글쓰기 창이 열려요. 확인하고 직접 올리세요 — 자동 게시는 약관 위반이라 하지 않아요. 링크에는 채널 표시가 붙어 어디서 사람이 왔는지 셀 수 있어요.</p>
${spec ? `<p class="tiny muted">${esc(spec.product ?? '')} · 파일 ${esc(sharePath)}</p>` : ''}${posts}
<section class="card"><h2>베타 의견</h2>${help('서비스의 "의견 보내기"로 들어온 익명 의견을 매일 한 번 이슈로 모아요. 고객지원 부서가 분류해요.')}${fb}</section>`;
}

// --- 설정·도움말
export function settingsPage({ s }) {
  return `<h1>설정</h1>
<form data-action="saveSettings" class="card stack"><h2>회사</h2>
<label>회사 이름<input name="company" value="${esc(s.company)}" maxlength="40"></label>
<label>환율 (1달러 = 원)<input name="rate" type="number" min="1" max="99999" value="${esc(s.rate)}"></label>
<h2>부서별 월 AI 예산 (달러)</h2>${help('부서가 한 달에 쓸 수 있는 AI 사용료 상한이에요. 다 쓰면 그 부서는 다음 달까지 멈춰요.')}
<div class="budget-grid">${DEPTS.map((d) => `<label>${d.name}<input name="budget_${d.id}" type="number" min="0" max="10000" step="1" value="${esc(s.budgets[d.id])}"></label>`).join('')}</div>
<h2>홍보</h2>${help('마케팅 부서가 쓴 채널별 홍보 글 파일 위치예요. 보통 그대로 두면 돼요.')}
<label>홍보 글 파일<input name="sharePath" value="${esc(s.sharePath)}" maxlength="200"></label>
<button class="primary">저장</button><p class="tiny muted">설정은 저장소의 atelier-data 브랜치(hq.json)에 저장돼 부서 실행이 바로 따라요.</p></form>
<section class="card"><h2>이 기기</h2><p>로그인 정보(토큰)는 이 브라우저에만 있어요. 공용 PC 라면 쓰고 나서 로그아웃하세요.</p><button class="danger" data-click="logout">로그아웃 (토큰 지우기)</button></section>`;
}

export function helpPage() {
  const terms = [
    ['결재', '부서가 대표님 허락을 받아야 하는 일이에요. 배포, 외부 게시, 돈 쓰는 일, 약관 변경이 여기 속해요.'],
    ['부서', 'AI 직원 팀이에요. 정해진 시간에 GitHub 에서 자기 일을 가져가 처리하고, 결과를 다시 GitHub 에 남겨요.'],
    ['업무 보드', '누가 무슨 일을 하고 있는지 보여 주는 칸반이에요. GitHub 이슈로 만들어져요.'],
    ['토큰·키', '외부 서비스에 들어가는 열쇠예요. 비밀번호처럼 남에게 보여 주면 안 돼요.'],
    ['예산', '부서가 한 달에 쓸 수 있는 AI 사용료 상한이에요.'],
    ['서버 없는 본부', '이 화면은 브라우저에서만 돌아요. 데이터는 대표님 저장소에 있고, Atelier 쪽 서버에는 아무것도 저장되지 않아요. 그래서 운영비가 0원이에요.'],
  ];
  return `<h1>도움말</h1><section class="card"><h2>하루 사용법</h2><ol>
<li>홈에서 <strong>오늘 회사 상태</strong>를 봐요. 초록이면 할 일 없어요.</li>
<li><strong>결재함</strong>에 뭐가 있으면 읽고 승인하거나 이유를 적어 반려해요.</li>
<li><strong>대표님이 할 일</strong>이 있으면 처리하고 완료를 눌러요.</li>
<li>시키고 싶은 일이 생기면 <strong>업무 → 새 일 맡기기</strong>.</li></ol></section>
<section class="card"><h2>용어</h2><dl>${terms.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></section>
<section class="card"><h2>하지 않는 일</h2><p>애니메이션·영상 제작, API 가 없는 커뮤니티 자동 게시(약관 위반), 대표 결재 없는 지출·배포·게시는 하지 않아요.</p></section>`;
}

export const loadingPage = () => '<p class="muted" role="status">불러오는 중…</p>';
