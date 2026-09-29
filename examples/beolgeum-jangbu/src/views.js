// 서버 렌더링 HTML. 모든 사용자 입력은 esc() 를 거친다.
import { summarize, entryFine, won } from './fines.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// <script type="application/json"> 안에 넣을 JSON — </script> 탈출 방지
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const STATUS_LABEL = { present: '출석', late: '지각', absent: '결석' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(d) {
  const [y, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일 (${DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
}

function layout({ title, body, description = '출석만 체크하세요. 벌금은 알아서 계산됩니다.', noindex = false, support = false, page = '/' }) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="/static/og.png">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="stylesheet" href="/static/tokens.css"><link rel="stylesheet" href="/static/app.css">
<script src="/static/app.js" defer></script>
</head><body><main>${body}</main>
<footer><a href="/">벌금장부</a> <span class="badge">베타</span> · <a href="/feedback?from=${encodeURIComponent(page)}">의견 보내기</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/terms">이용약관</a> · <a href="mailto:atlier.skill@gmail.com">문의</a>${support ? ' · <a href="/support" rel="nofollow">☕ 개발자 응원하기</a>' : ''}</footer>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
</body></html>`;
}

export function homePage({ support } = {}) {
  return layout({
    support,
    title: '벌금장부 — 가입 없는 스터디 벌금 계산',
    body: `<h1>벌금장부</h1>
<p class="muted">출석만 체크하세요. 벌금은 알아서 계산됩니다.<br>가입 없이 링크 하나로.</p>
<form id="create-form" novalidate>
<label for="name">모임 이름</label>
<input id="name" name="name" type="text" maxlength="40" required autocomplete="off" aria-describedby="name-err">
<p class="error" id="name-err" hidden></p>
<div class="row">
<div><label for="fine_late">지각</label><input id="fine_late" name="fine_late" type="number" inputmode="numeric" min="0" max="1000000" step="100" value="1000" aria-describedby="fine_late-err"></div>
<div><label for="fine_absent">결석</label><input id="fine_absent" name="fine_absent" type="number" inputmode="numeric" min="0" max="1000000" step="100" value="3000" aria-describedby="fine_absent-err"></div>
<div><label for="fine_homework">과제 미제출</label><input id="fine_homework" name="fine_homework" type="number" inputmode="numeric" min="0" max="1000000" step="100" value="2000" aria-describedby="fine_homework-err"></div>
</div>
<p class="error" id="fine_late-err" hidden></p><p class="error" id="fine_absent-err" hidden></p><p class="error" id="fine_homework-err" hidden></p>
<p class="error" id="form-err" role="alert" hidden></p>
<p></p><button class="primary" type="submit">모임 만들기</button>
</form>
<noscript><p class="error">이 서비스는 JavaScript 가 필요해요.</p></noscript>
<h2>이런 모임에 좋아요</h2>
<p>스터디·운동·독서 모임에서 매주 지각비·결석비를 단톡방과 엑셀로 계산하고 있다면.</p>
<h2>이렇게 써요</h2>
<ol><li>벌금 규칙을 정해 모임을 만들어요.</li><li>모임 날마다 출석·지각·결석만 체크해요.</li><li>멤버별 벌금과 미납액이 자동으로 쌓여요. 보기 링크를 단톡방에 공유하세요.</li></ol>
<h2>자주 묻는 질문</h2>
<p><strong>가입해야 하나요?</strong><br>아니요. 모임을 만들면 나오는 관리 링크만 저장해 두면 돼요.</p>
<p><strong>돈도 걷어 주나요?</strong><br>아니요. 계산과 기록만 해요. 돈은 모임 통장이나 송금으로 주고받으세요.</p>
<p><strong>규칙을 바꾸면 지난 벌금도 바뀌나요?</strong><br>아니요. 지난 회차는 그때 규칙으로 계산돼요.</p>
<p><strong>멤버 이름은 어떻게 적나요?</strong><br>보기 링크를 가진 사람은 누구나 볼 수 있으니 별명을 권해요.</p>
<h2>주변에 알려 주세요</h2>
<p class="muted">벌금 계산에 지친 다른 모임에도 도움이 될 거예요.</p>
<button type="button" id="share-app">친구 모임에 알려주기</button>`,
  });
}

export function groupPage({ group, members, sessions, payments }, { support } = {}) {
  const active = members.filter((m) => !m.hidden_at);
  const summary = summarize(members, sessions, payments).filter((r) => !r.member.hidden_at || r.fined || r.paid);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const summaryRows = summary
    .map(
      (r) => `<tr><td>${esc(r.member.name)}${r.member.hidden_at ? ' <span class="muted">(나감)</span>' : ''}</td>
<td class="num">${r.fined.toLocaleString('ko-KR')}</td><td class="num">${r.paid.toLocaleString('ko-KR')}</td>
<td class="num ${r.balance > 0 ? 'unpaid' : 'paid'}">${r.balance < 0 ? `선납 ${(-r.balance).toLocaleString('ko-KR')}` : r.balance.toLocaleString('ko-KR')}</td></tr>`,
    )
    .join('');
  const sessionItems = sessions
    .map((s) => {
      const total = s.entries.reduce((a, e) => a + entryFine(e, s), 0);
      const detail = s.entries
        .filter((e) => entryFine(e, s) > 0)
        .map((e) => `${esc(memberName.get(e.member_id) ?? '?')} ${STATUS_LABEL[e.status] !== '출석' ? STATUS_LABEL[e.status] : ''}${e.homework_missed ? ' 과제' : ''} ${won(entryFine(e, s))}`)
        .join(', ');
      return `<li class="card" data-session-id="${s.id}"><strong>${dateLabel(s.date)}</strong> · 합계 ${won(total)}
<p class="muted">${detail || '벌금 없음'}</p><div class="admin-only" hidden><button type="button" data-edit-session="${s.id}">수정</button> <button type="button" class="danger" data-delete-session="${s.id}">삭제</button></div></li>`;
    })
    .join('');
  const memberItems = active
    .map((m) => `<li class="att"><span>${esc(m.name)}</span><button type="button" class="danger" data-hide-member="${m.id}" aria-label="${esc(m.name)} 내보내기">내보내기</button></li>`)
    .join('');
  const payRows = payments
    .slice(0, 50)
    .map((p) => `<li class="att"><span>${esc(memberName.get(p.member_id) ?? '?')} ${won(p.amount)} <span class="muted">${p.paid_at.slice(0, 10)}</span></span><button type="button" class="danger" data-delete-payment="${p.id}" aria-label="납부 기록 삭제">삭제</button></li>`)
    .join('');
  const data = {
    group: { id: group.id, name: group.name, fine_late: group.fine_late, fine_absent: group.fine_absent, fine_homework: group.fine_homework },
    members: active.map(({ id, name }) => ({ id, name })),
    sessions: sessions.map(({ id, date, updated_at, entries }) => ({ id, date, updated_at, entries })),
    summary: summary.map((r) => ({ name: r.member.name, hidden: !!r.member.hidden_at, balance: r.balance })),
  };
  return layout({
    support,
    page: '/g/:id',
    title: `${group.name} — 벌금장부`,
    description: `${group.name} 벌금 정산 현황`,
    noindex: true,
    body: `<h1>${esc(group.name)}</h1>
<p class="muted">지각 ${won(group.fine_late)} · 결석 ${won(group.fine_absent)} · 과제 미제출 ${won(group.fine_homework)}</p>
<div class="admin-only" hidden>
<div class="notice"><strong>관리 링크를 꼭 저장하세요.</strong> 잃어버리면 편집할 수 없어요. 멤버에게는 보기 링크만 보내세요.</div>
<div class="card">
<label for="admin-link">관리 링크 (나만)</label><div class="linkbox"><input id="admin-link" type="text" readonly><button type="button" data-copy="admin-link">복사</button></div>
<label for="view-link">보기 링크 (멤버에게 공유)</label><div class="linkbox"><input id="view-link" type="text" readonly><button type="button" data-copy="view-link">복사</button><button type="button" id="share-view" hidden>공유</button></div>
</div></div>
<p class="error" id="key-err" role="alert" hidden>관리 링크가 올바르지 않아요. 보기 전용으로 표시합니다.</p>

<h2>정산</h2>
${summary.length ? `<table><thead><tr><th>멤버</th><th class="num">벌금</th><th class="num">납부</th><th class="num">미납</th></tr></thead><tbody>${summaryRows}</tbody></table>
<p></p><button type="button" id="copy-summary">카톡용 요약 복사</button> <button type="button" id="share-summary" hidden>요약 공유</button>` :`<div class="empty"><p>아직 멤버가 없어요.</p><p class="admin-only" hidden>아래에서 멤버를 추가하면 출결을 체크할 수 있어요.</p></div>`}

<section class="admin-only" hidden aria-labelledby="session-h">
<h2 id="session-h">회차 기록</h2>
<form id="session-form" novalidate>
<label for="session-date">날짜</label><input id="session-date" type="date" required>
<div id="session-entries"></div>
<p class="muted" id="session-total"></p>
<p class="error" id="session-err" role="alert" hidden></p>
<button class="primary" type="submit" id="session-submit">저장</button>
<button type="button" id="session-cancel" hidden>수정 취소</button>
</form>
</section>

<section class="admin-only" hidden aria-labelledby="pay-h">
<h2 id="pay-h">납부 기록 <span class="muted">(입금 확인)</span></h2>
<form id="pay-form" class="row" novalidate>
<div><label for="pay-member">멤버</label><select id="pay-member">${active.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
<div><label for="pay-amount">금액</label><input id="pay-amount" type="number" inputmode="numeric" min="1" max="1000000" step="100"></div>
<div><button type="submit">기록</button></div>
</form>
<p class="error" id="pay-err" role="alert" hidden></p>
<ul class="plain">${payRows}</ul>
</section>

<h2>지난 회차</h2>
${sessions.length ? `<ul class="plain">${sessionItems}</ul>` : '<p class="empty">아직 기록이 없어요.</p>'}

<section class="admin-only" hidden aria-labelledby="member-h">
<h2 id="member-h">멤버 관리</h2>
<form id="member-form" class="row" novalidate>
<div><label for="member-name">이름 (별명 권장)</label><input id="member-name" type="text" maxlength="30" autocomplete="off"></div>
<div><button type="submit">추가</button></div>
</form>
<p class="error" id="member-err" role="alert" hidden></p>
<ul class="plain">${memberItems}</ul>

<h2>모임 삭제</h2>
<p class="muted">삭제하면 바로 볼 수 없게 되고 30일 뒤 완전히 지워져요.</p>
<button type="button" class="danger" id="delete-group">모임 삭제</button>
</section>
<div class="card viewer-only"><p><strong>우리 모임도 벌금 계산이 귀찮다면?</strong><br><span class="muted">가입 없이 1분이면 만들어요.</span></p><a class="btn" href="/?ref=view">우리 모임 장부 만들기</a></div>
<script type="application/json" id="data">${safeJson(data)}</script>`,
  });
}

export function notFoundPage({ support } = {}) {
  return layout({
    support,
    title: '모임을 찾을 수 없어요 — 벌금장부',
    noindex: true,
    body: `<div class="empty"><h1>모임을 찾을 수 없어요</h1><p>링크가 잘못됐거나 삭제된 모임이에요.</p><a class="btn primary" href="/">새 모임 만들기</a></div>`,
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
    title: '의견 보내기 — 벌금장부',
    body: `<h1>의견 보내기</h1>
<p class="muted">벌금장부는 베타예요. 써 보신 느낌을 한 줄만 남겨 주셔도 큰 도움이 돼요.</p>
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
  return layout({ support, page, title: `${title} — 벌금장부`, body: `<div class="doc">${out.join('\n')}</div>` });
}
