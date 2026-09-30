// 서버 렌더링 HTML. 모든 사용자 입력은 esc() 를 거친다. 버튼(찜·챙김)은 "나는 누구"를 아는 브라우저(app.js)가 붙인다.
import { TEMPLATES } from './templates.js';
import { balances, transfers, won } from './settle.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const NAME = '챙김표';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(d) {
  const [y, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일 (${DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
}

function layout({ title, body, description = '캠핑·여행 준비물, 누가 뭘 챙길지 링크 하나로 나누고 장본 돈까지 n빵.', noindex = false, support = false, page = '/' }) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="/static/og.png">
<meta name="theme-color" content="#1f5d3f">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="stylesheet" href="/static/tokens.css"><link rel="stylesheet" href="/static/app.css">
<script src="/static/app.js" defer></script>
</head><body><main>${body}</main>
<footer><a href="/">${NAME}</a> <span class="badge">베타</span> · <a href="/feedback?from=${encodeURIComponent(page)}">의견 보내기</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/terms">이용약관</a> · <a href="mailto:atlier.skill@gmail.com">문의</a>${support ? ' · <a href="/support" rel="nofollow">☕ 개발자 응원하기</a>' : ''}</footer>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
</body></html>`;
}

export function homePage({ support } = {}) {
  const choices = Object.entries(TEMPLATES)
    .map(([k, t], i) => `<label class="chip"><input type="radio" name="template" value="${k}"${i === 0 ? ' checked' : ''}><span>${esc(t.label)}</span></label>`)
    .join('');
  return layout({
    support,
    title: `${NAME} — 캠핑·여행 준비물 나누기`,
    body: `<p class="eyebrow">${NAME}</p>
<h1>누가 뭘 챙길지,<br>링크 하나로.</h1>
<p class="muted">단톡방에서 "버너 누가 가져와?" 묻지 마세요. 목록을 만들어 링크를 보내면 친구들이 직접 맡고, 장본 돈은 자동으로 n빵돼요. 가입 없음.</p>
<form id="create-form" class="card" novalidate>
<label for="name">어디 가요?</label>
<input id="name" name="name" type="text" maxlength="40" required autocomplete="off" placeholder="예: 가평 캠핑" aria-describedby="name-err">
<p class="error" id="name-err" hidden></p>
<fieldset><legend>무슨 모임이에요? <span class="muted">(준비물을 미리 채워 드려요)</span></legend><div class="chips">${choices}</div></fieldset>
<label for="starts_on">언제 가요? <span class="muted">(선택)</span></label>
<input id="starts_on" name="starts_on" type="date" aria-describedby="starts_on-err">
<p class="error" id="starts_on-err" hidden></p>
<p class="error" id="form-err" role="alert" hidden></p>
<button class="primary" type="submit">준비물 목록 만들기</button>
</form>
<noscript><p class="error">이 서비스는 JavaScript 가 필요해요.</p></noscript>
<h2>이렇게 써요</h2>
<ol class="steps"><li><strong>목록 만들기</strong> — 캠핑·여행·MT 기본 준비물이 채워져요. 고치고 더하세요.</li>
<li><strong>링크 보내기</strong> — 단톡방에 링크 하나. 친구들은 이름만 고르면 돼요.</li>
<li><strong>각자 맡기</strong> — "내가 챙길게"를 누르면 끝. 겹치지도, 빠지지도 않아요.</li>
<li><strong>장본 돈 n빵</strong> — 누가 얼마 냈는지 적으면 누가 누구에게 보낼지 바로 나와요.</li></ol>
<h2>자주 묻는 질문</h2>
<p><strong>친구들도 가입해야 하나요?</strong><br>아니요. 링크를 열고 이름만 고르면 돼요.</p>
<p><strong>돈도 대신 보내 주나요?</strong><br>아니요. 누가 누구에게 얼마를 보내면 되는지 계산만 해요. 송금은 평소처럼 하세요.</p>
<p><strong>링크가 퍼지면요?</strong><br>링크를 가진 사람은 누구나 목록을 고칠 수 있어요. 함께 가는 사람에게만 보내 주세요. 이름은 별명도 괜찮아요.</p>
<h2>주변에 알려 주세요</h2>
<button type="button" id="share-app">다른 모임에 알려주기</button>`,
  });
}

const ACTIONS = {
  join: '참여',
  person_hide: '내보냄',
  trip_edit: '목록 고침',
  item_add: '추가',
  item_edit: '고침',
  item_delete: '지움',
  item_restore: '되살림',
  item_claim: '맡음',
  item_unclaim: '맡기 취소',
  item_pack: '챙김 ✓',
  item_unpack: '챙김 취소',
  expense_add: '낸 돈 기록',
  expense_delete: '낸 돈 지움',
  expense_restore: '낸 돈 되살림',
};
export function ago(iso, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
function activityItem(a) {
  const who = a.who ? `<strong>${esc(a.who)}</strong> · ` : '';
  const what = a.action === 'join' ? `${ACTIONS.join}` : `${ACTIONS[a.action] ?? esc(a.action)}: ${esc(a.target)}`;
  const label = a.action === 'join' ? esc(a.target) : '';
  const restore = a.restorable
    ? `<button type="button" class="ghost" data-restore="${a.ref_kind}:${a.ref_id}" aria-label="${esc(a.target)} 되살리기">되살리기</button>`
    : '';
  return `<li class="personal"><span>${a.action === 'join' ? `<strong>${label}</strong> · ${what}` : `${who}${what}`} <span class="muted">${ago(a.created_at)}</span></span>${restore}</li>`;
}

function ownerLabel(item, names) {
  if (item.claimed_by == null) return '<span class="tag tag-open">아직 없음</span>';
  const who = esc(names.get(item.claimed_by) ?? '?');
  return item.packed ? `<span class="tag tag-done">${who} · 챙김 ✓</span>` : `<span class="tag">${who} 맡음</span>`;
}

export function tripPage({ trip, people, items, expenses, activity = [] }, { support } = {}) {
  const active = people.filter((p) => !p.hidden_at);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const shared = items.filter((i) => i.kind === 'shared');
  const personal = items.filter((i) => i.kind === 'personal');
  const claimed = shared.filter((i) => i.claimed_by != null).length;
  const packed = shared.filter((i) => i.packed).length;
  const rows = balances(people, expenses).filter((r) => !r.person.hidden_at || r.paid || r.owed);
  const moves = transfers(rows);

  const itemRows = shared
    .map(
      (i) => `<li class="item${i.claimed_by == null ? ' open' : ''}" data-item-id="${i.id}" data-claimed-by="${i.claimed_by ?? ''}" data-packed="${i.packed ? 1 : 0}" data-name="${esc(i.name)}">
<div class="item-main"><strong>${esc(i.name)}</strong>${i.qty > 1 ? ` <span class="muted">×${i.qty}</span>` : ''}<br>${ownerLabel(i, names)}</div>
<div class="item-actions"></div><div class="item-more" hidden></div></li>`,
    )
    .join('');
  const personalRows = personal
    .map((i) => `<li class="personal" data-item-id="${i.id}" data-name="${esc(i.name)}"><span>${esc(i.name)}</span><button type="button" class="ghost" data-delete-item="${i.id}" aria-label="${esc(i.name)} 삭제">삭제</button></li>`)
    .join('');
  const balanceRows = rows
    .map(
      (r) => `<tr><td>${esc(r.person.name)}${r.person.hidden_at ? ' <span class="muted">(나감)</span>' : ''}</td><td class="num">${r.paid.toLocaleString('ko-KR')}</td><td class="num">${r.owed.toLocaleString('ko-KR')}</td>
<td class="num ${r.net > 0 ? 'plus' : r.net < 0 ? 'minus' : ''}">${r.net > 0 ? '+' : ''}${r.net.toLocaleString('ko-KR')}</td></tr>`,
    )
    .join('');
  const moveItems = moves.map((m) => `<li><strong>${esc(names.get(m.from))}</strong> → <strong>${esc(names.get(m.to))}</strong> ${won(m.amount)}</li>`).join('');
  const expenseItems = expenses
    .slice(0, 100)
    .map(
      (e) => `<li class="personal"><span>${esc(names.get(e.paid_by) ?? '?')} ${won(e.amount)}${e.memo ? ` · ${esc(e.memo)}` : ''} <span class="muted">(${e.shares.length}명)</span></span><button type="button" class="ghost" data-delete-expense="${e.id}" aria-label="${esc(e.memo || won(e.amount))} 지출 삭제">삭제</button></li>`,
    )
    .join('');
  const data = {
    trip: { id: trip.id, name: trip.name, starts_on: trip.starts_on, v: trip.updated_at ?? trip.created_at },
    people: active.map(({ id, name }) => ({ id, name })),
    items: items.map(({ id, name, qty, kind, claimed_by, packed }) => ({ id, name, qty, kind, claimed_by, packed })),
    moves: moves.map((m) => ({ from: names.get(m.from), to: names.get(m.to), amount: m.amount })),
  };

  return layout({
    support,
    page: '/t/:id',
    noindex: true,
    title: `${trip.name} 준비물 — ${NAME}`,
    description: `${trip.name} 준비물, 누가 뭘 챙길지 여기서 맡아 주세요.`,
    body: `<p class="eyebrow">${NAME}</p>
<div class="notice update-bar" id="update-bar" role="status" hidden>친구가 바꾼 내용이 있어요. <button type="button" id="update-reload">새로 보기</button></div>
<h1>${esc(trip.name)}</h1>
<p class="muted">${trip.starts_on ? `${dateLabel(trip.starts_on)} · ` : ''}${active.length}명 참여 <button type="button" class="ghost inline" id="trip-edit">이름·날짜 고치기</button></p>
<form id="trip-form" class="card" novalidate hidden>
<label for="trip-name">이름</label><input id="trip-name" type="text" maxlength="40" value="${esc(trip.name)}">
<label for="trip-date">날짜 <span class="muted">(선택)</span></label><input id="trip-date" type="date" value="${esc(trip.starts_on ?? '')}">
<p class="error" id="trip-err" role="alert" hidden></p>
<div class="row"><button type="submit">저장</button><button type="button" id="trip-cancel">취소</button></div>
</form>

<div class="admin-only notice" hidden><strong>관리 링크를 저장해 두세요.</strong> 목록 삭제·사람 내보내기는 이 링크로만 돼요. 친구에게는 아래 <a href="#invite-h">초대 링크</a>를 보내세요.
<div class="linkbox"><label class="sr-only" for="admin-link">관리 링크</label><input id="admin-link" type="text" readonly><button type="button" data-copy="admin-link">관리 링크 복사</button></div></div>
<p class="error" id="key-err" role="alert" hidden></p>

<section class="card me" aria-labelledby="me-h">
<h2 id="me-h" class="h3">나는 누구예요?</h2>
<div id="me-pick"${active.length ? '' : ' hidden'}><label for="me" class="sr-only">내 이름 고르기</label><select id="me"><option value="">이름을 골라 주세요</option>${active.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
<form id="join-form" class="row" novalidate>
<div><label for="join-name">${active.length ? '목록에 없으면 내 이름 추가' : '먼저 내 이름을 적어 주세요'}</label><input id="join-name" type="text" maxlength="20" autocomplete="nickname" placeholder="별명도 좋아요"></div>
<div><button type="submit">참여하기</button></div>
</form>
<p class="error" id="join-err" role="alert" hidden></p>
<p class="muted" id="me-status" aria-live="polite"></p>
</section>

<section class="card invite" aria-labelledby="invite-h">
<h2 id="invite-h" class="h3">친구 초대</h2>
<p class="muted">이 링크를 단톡방에 보내면 친구들이 이름을 고르고 직접 맡아요.</p>
<div class="linkbox"><label class="sr-only" for="invite-link">초대 링크</label><input id="invite-link" type="text" readonly value=""><button type="button" data-copy="invite-link">링크 복사</button></div>
<div class="row share"><button type="button" id="copy-summary">카톡용 현황 복사</button> <button type="button" id="share-trip" hidden>공유하기</button></div>
</section>

<section aria-labelledby="shared-h">
<h2 id="shared-h">함께 쓸 준비물 <span class="count">${claimed}/${shared.length} 맡음</span></h2>
<progress max="${Math.max(shared.length, 1)}" value="${claimed}" aria-label="맡은 준비물 ${claimed}개 / ${shared.length}개"></progress>
<p class="muted">${shared.length ? `아직 주인 없는 것 ${shared.length - claimed}개 · 챙김 완료 ${packed}개` : '아직 준비물이 없어요. 아래에서 추가해 주세요.'}</p>
<div class="chips filter" role="group" aria-label="보기">
<label class="chip"><input type="radio" name="filter" value="all" checked><span>전체</span></label>
<label class="chip"><input type="radio" name="filter" value="open"><span>주인 없음</span></label>
<label class="chip"><input type="radio" name="filter" value="mine"><span>내가 맡은 것</span></label></div>
<ul class="plain items">${itemRows}</ul>
<p class="empty" id="filter-empty" hidden>여기에 해당하는 준비물이 없어요.</p>
<form id="item-form" class="row add" novalidate>
<div class="grow"><label for="item-name">준비물 추가</label><input id="item-name" type="text" maxlength="30" autocomplete="off" placeholder="예: 고기 2kg"></div>
<div class="qty"><label for="item-qty">수량</label><input id="item-qty" type="number" inputmode="numeric" min="1" max="99" value="1"></div>
<div><button type="submit">추가</button></div>
</form>
<p class="error" id="item-err" role="alert" hidden></p>
</section>

<section aria-labelledby="personal-h">
<h2 id="personal-h">각자 챙길 것</h2>
<p class="muted">모두 한 개씩 챙기는 것 — 맡을 필요 없이 확인용이에요.</p>
${personal.length ? `<ul class="plain">${personalRows}</ul>` : ''}
<form id="personal-form" class="row add" novalidate>
<div class="grow"><label for="personal-name">각자 챙길 것 추가</label><input id="personal-name" type="text" maxlength="30" autocomplete="off" placeholder="예: 슬리퍼"></div>
<div><button type="submit">추가</button></div>
</form>
<p class="error" id="personal-err" role="alert" hidden></p>
</section>

<section aria-labelledby="money-h">
<h2 id="money-h">장본 돈 나누기 <span class="count">n빵 정산</span></h2>
${
  expenses.length
    ? `${moves.length ? `<div class="card"><p class="h3">이렇게 보내면 끝</p><ul class="plain moves">${moveItems}</ul></div>` : '<p class="card">모두 정산됐어요.</p>'}
<table><thead><tr><th>이름</th><th class="num">낸 돈</th><th class="num">부담</th><th class="num">차액</th></tr></thead><tbody>${balanceRows}</tbody></table>`
    : '<p class="muted">마트·고기·장작 등 먼저 낸 돈을 적으면 누가 누구에게 얼마 보낼지 계산해 드려요.</p>'
}
<form id="expense-form" class="card" novalidate${active.length ? '' : ' hidden'}>
<p class="h3">낸 돈 적기</p>
<div class="row"><div><label for="exp-payer">낸 사람</label><select id="exp-payer">${active.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
<div><label for="exp-amount">금액 (원)</label><input id="exp-amount" type="number" inputmode="numeric" min="1" max="10000000" step="100"></div></div>
<label for="exp-memo">어디에 썼어요? <span class="muted">(선택)</span></label><input id="exp-memo" type="text" maxlength="40" placeholder="예: 마트 장보기">
<fieldset><legend>누구와 나눠요?</legend><div class="chips">${active.map((p) => `<label class="chip"><input type="checkbox" name="share" value="${p.id}" checked><span>${esc(p.name)}</span></label>`).join('')}</div></fieldset>
<p class="error" id="exp-err" role="alert" hidden></p>
<button class="primary" type="submit">기록하기</button>
</form>
${expenses.length ? `<h3 class="h3">지출 기록</h3><ul class="plain">${expenseItems}</ul>` : ''}
</section>


<section aria-labelledby="activity-h">
<h2 id="activity-h">최근 변경</h2>
${activity.length ? `<p class="muted">실수로 지운 준비물·낸 돈은 7일 동안 여기서 되살릴 수 있어요.</p><ul class="plain">${activity.map(activityItem).join('')}</ul>` : '<p class="muted">아직 변경이 없어요.</p>'}
</section>

<section class="admin-only" hidden aria-labelledby="manage-h">
<h2 id="manage-h">관리</h2>
${active.length ? `<ul class="plain">${active.map((p) => `<li class="personal"><span>${esc(p.name)}</span><button type="button" class="ghost danger" data-hide-person="${p.id}" aria-label="${esc(p.name)} 내보내기">내보내기</button></li>`).join('')}</ul>` : ''}
<p class="muted">목록을 삭제하면 바로 볼 수 없게 되고 30일 뒤 완전히 지워져요.</p>
<button type="button" class="danger" id="delete-trip">목록 삭제</button>
</section>
<div class="card viewer-cta"><p><strong>다음 여행도 준비물 정하기 귀찮다면?</strong><br><span class="muted">가입 없이 1분이면 만들어요.</span></p><a class="btn" href="/?ref=trip">새 목록 만들기</a></div>
<script type="application/json" id="data">${safeJson(data)}</script>`,
  });
}

export function statsPage({ support } = {}) {
  return layout({
    support,
    page: '/stats',
    noindex: true,
    title: `지표 — ${NAME}`,
    body: `<h1>지표</h1>
<form id="stats-form" class="card" novalidate>
<label for="stats-token">지표 토큰</label>
<input id="stats-token" type="password" autocomplete="off" aria-describedby="stats-help">
<p class="muted" id="stats-help">토큰은 이 브라우저에만 기억돼요. 주소 끝에 <code>#t=토큰</code> 을 붙여 즐겨찾기해도 돼요.</p>
<p class="error" id="stats-err" role="alert" hidden></p>
<button class="primary" type="submit">보기</button>
</form>
<div id="stats-out" hidden>
<h2>이번 주</h2><dl class="kpis" id="stats-kpis"></dl>
<h2>최근 14일 <span class="count">만든 목록 · 2명 이상 · 정산까지</span></h2>
<table><thead><tr><th>날짜</th><th class="num">만든 목록</th><th class="num">2명 이상</th><th class="num">정산까지</th><th>함께 쓴 비율</th></tr></thead><tbody id="stats-days"></tbody></table>
<p class="muted" id="stats-at"></p>
</div>`,
  });
}

export function notFoundPage({ support } = {}) {
  return layout({
    support,
    title: `목록을 찾을 수 없어요 — ${NAME}`,
    noindex: true,
    body: `<div class="empty"><h1>목록을 찾을 수 없어요</h1><p>링크가 잘못됐거나 삭제된 목록이에요.</p><a class="btn primary" href="/">새 목록 만들기</a></div>`,
  });
}

const FEEDBACK_CHOICES = [
  ['good', '좋아요'],
  ['hard', '불편해요'],
  ['bug', '오류가 있어요'],
  ['idea', '이런 게 있으면 좋겠어요'],
];
export function feedbackPage({ support, from = '' } = {}) {
  return layout({
    support,
    page: '/feedback',
    noindex: true,
    title: `의견 보내기 — ${NAME}`,
    body: `<h1>의견 보내기</h1>
<p class="muted">${NAME}은 베타예요. 써 보신 느낌을 한 줄만 남겨 주셔도 큰 도움이 돼요.</p>
<form id="feedback-form" novalidate>
<fieldset><legend>어떤 의견인가요?</legend>
${FEEDBACK_CHOICES.map(([v, l], i) => `<label class="choice"><input type="radio" name="kind" value="${v}"${i === 0 ? ' checked' : ''}> ${l}</label>`).join('\n')}
</fieldset>
<label for="fb-message">내용</label>
<textarea id="fb-message" maxlength="1000" rows="5" aria-describedby="fb-help"></textarea>
<p class="muted" id="fb-help">이름·연락처 같은 개인정보는 적지 마세요. 보내 주신 내용은 개선을 위해 공개 개발 게시판(GitHub)에 익명으로 옮겨질 수 있어요.</p>
<input type="hidden" id="fb-from" value="${esc(from)}">
<div class="hp" aria-hidden="true"><label for="fb-website">비워 두세요</label><input id="fb-website" type="text" tabindex="-1" autocomplete="off"></div>
<p class="error" id="fb-err" role="alert" hidden></p>
<button class="primary" type="submit">보내기</button>
</form>
<div class="empty" id="fb-done" hidden><h2 tabindex="-1">고마워요!</h2><p>보내 주신 의견은 매일 확인해요.</p><a class="btn" href="/">처음으로</a></div>`,
  });
}

export function docPage(title, markdownish, { support, page } = {}) {
  // 법률 문서용 최소 마크다운: 제목(#, ##), 목록(-), 표(|), 문단
  const out = [];
  let list = null;
  let table = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    if (table) {
      const [head, , ...rows] = table;
      const cells = (r, tag) => r.split('|').slice(1, -1).map((c) => `<${tag}>${esc(c.trim())}</${tag}>`).join('');
      out.push(`<table><thead><tr>${cells(head, 'th')}</tr></thead><tbody>${rows.map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`);
    }
    list = table = null;
  };
  for (const l of markdownish.split('\n')) {
    if (l.startsWith('|')) (table ??= []).push(l);
    else if (l.startsWith('- ')) (list ??= []).push(`<li>${esc(l.slice(2))}</li>`);
    else {
      flush();
      if (l.startsWith('# ')) out.push(`<h1>${esc(l.slice(2))}</h1>`);
      else if (l.startsWith('## ')) out.push(`<h2>${esc(l.slice(3))}</h2>`);
      else if (l.trim()) out.push(`<p>${esc(l)}</p>`);
    }
  }
  flush();
  return layout({ support, page, title: `${title} — ${NAME}`, body: `<div class="doc">${out.join('\n')}</div>` });
}
