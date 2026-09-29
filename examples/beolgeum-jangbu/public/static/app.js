// 클라이언트 동작 — 관리 키는 URL 조각(#k=)에만 두고 서버로는 헤더로 보낸다.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const won = (n) => `${n.toLocaleString('ko-KR')}원`;
  const NET_ERR = '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요';

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2500);
  }
  function showErr(el, msg) {
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  async function api(method, url, body, key) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Admin-Key': key } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch {
      throw Object.assign(new Error(NET_ERR), { network: true });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || NET_ERR), { status: res.status, data });
    return data;
  }
  async function busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '처리 중…';
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('복사했어요');
  }

  // --- 첫 화면: 모임 만들기
  const createForm = $('#create-form');
  if (createForm) {
    createForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const btn = createForm.querySelector('button[type=submit]');
      const body = Object.fromEntries(['name', 'fine_late', 'fine_absent', 'fine_homework'].map((k) => [k, k === 'name' ? $(`#${k}`).value : Number($(`#${k}`).value)]));
      for (const k of Object.keys(body)) {
        $(`#${k}`).removeAttribute('aria-invalid');
        showErr($(`#${k}-err`), '');
      }
      showErr($('#form-err'), '');
      busy(btn, async () => {
        try {
          const { id, adminKey } = await api('POST', '/api/groups', body);
          location.href = `/g/${id}#k=${adminKey}`;
        } catch (e) {
          const fields = e.data?.fields;
          if (fields) {
            for (const [k, msg] of Object.entries(fields)) {
              $(`#${k}`).setAttribute('aria-invalid', 'true');
              showErr($(`#${k}-err`), msg);
            }
            $(`#${Object.keys(fields)[0]}`).focus();
          } else showErr($('#form-err'), e.message);
        }
      });
    });
    return;
  }

  // --- 모임 화면
  const dataEl = $('#data');
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const gid = data.group.id;
  const key = new URLSearchParams(location.hash.slice(1)).get('k');

  $('#copy-summary')?.addEventListener('click', () => {
    const lines = data.summary
      .filter((r) => !r.hidden || r.balance !== 0)
      .map((r) => (r.balance > 0 ? `${r.name} ${won(r.balance)} 미납` : r.balance < 0 ? `${r.name} ${won(-r.balance)} 선납` : `${r.name} 완납`));
    const total = data.summary.reduce((a, r) => a + Math.max(r.balance, 0), 0);
    copyText([`[${data.group.name}] 벌금 정산`, ...lines, `미납 합계 ${won(total)}`, `${location.origin}/g/${gid}`].join('\n'));
    fetch('/api/events/summary_copied', { method: 'POST' }).catch(() => {});
  });

  if (!key) return;
  api('POST', `/api/groups/${gid}/auth`, null, key)
    .then(enableAdmin)
    .catch((e) => showErr($('#key-err'), e.network ? '연결을 확인해 주세요. 지금은 보기 전용이에요.' : '관리 링크가 올바르지 않아요. 보기 전용으로 표시합니다.'));

  function enableAdmin() {
    $$('.admin-only').forEach((el) => (el.hidden = false));
    $('#admin-link').value = `${location.origin}/g/${gid}#k=${key}`;
    $('#view-link').value = `${location.origin}/g/${gid}`;
    $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText($(`#${b.dataset.copy}`).value)));
    const call = (method, path, body) => api(method, `/api/groups/${gid}${path}`, body, key);
    const done = (msg) => {
      toast(msg);
      setTimeout(() => location.reload(), 400);
    };

    // 회차 편집기
    const entriesEl = $('#session-entries');
    const dateEl = $('#session-date');
    let editing = null;
    const today = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    function renderEntries(entries = []) {
      const byMember = new Map(entries.map((e) => [e.member_id, e]));
      entriesEl.replaceChildren();
      if (!data.members.length) {
        entriesEl.innerHTML = '<p class="muted">멤버를 먼저 추가해 주세요.</p>';
        $('#session-submit').disabled = true;
        return;
      }
      for (const m of data.members) {
        const e = byMember.get(m.id) ?? { status: 'present', homework_missed: false };
        const row = document.createElement('div');
        row.className = 'att';
        row.dataset.memberId = m.id;
        const name = document.createElement('strong');
        name.textContent = m.name;
        const seg = document.createElement('span');
        seg.className = 'seg';
        seg.setAttribute('role', 'radiogroup');
        seg.setAttribute('aria-label', `${m.name} 출결`);
        for (const [val, label] of [['present', '출석'], ['late', '지각'], ['absent', '결석']]) {
          const l = document.createElement('label');
          const input = Object.assign(document.createElement('input'), { type: 'radio', name: `st-${m.id}`, value: val, checked: e.status === val });
          const span = document.createElement('span');
          span.textContent = label;
          l.append(input, span);
          seg.append(l);
        }
        const hw = document.createElement('label');
        hw.className = 'hw';
        const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!e.homework_missed });
        hw.append(cb, ' 과제 미제출');
        row.append(name, seg, hw);
        entriesEl.append(row);
      }
      updateTotal();
    }
    const collect = () =>
      $$('#session-entries .att').map((row) => ({
        member_id: Number(row.dataset.memberId),
        status: row.querySelector('input[type=radio]:checked').value,
        homework_missed: row.querySelector('input[type=checkbox]').checked,
      }));
    function updateTotal() {
      const g = editing ? data.sessions.find((s) => s.id === editing.id) : data.group;
      const total = collect().reduce((a, e) => a + (e.status === 'late' ? g.fine_late : 0) + (e.status === 'absent' ? g.fine_absent : 0) + (e.homework_missed ? g.fine_homework : 0), 0);
      $('#session-total').textContent = `이번 회차 합계 ${won(total)}`;
    }
    entriesEl.addEventListener('change', updateTotal);
    dateEl.value = today();
    renderEntries();

    $('#session-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      showErr($('#session-err'), '');
      if (!dateEl.value) return showErr($('#session-err'), '날짜를 선택해 주세요');
      busy($('#session-submit'), async () => {
        try {
          const body = { date: dateEl.value, entries: collect() };
          if (editing) await call('PUT', `/sessions/${editing.id}`, { ...body, expectedUpdatedAt: editing.updated_at });
          else await call('POST', '/sessions', body);
          done('저장했어요');
        } catch (e) {
          showErr($('#session-err'), e.message);
        }
      });
    });
    $$('[data-edit-session]').forEach((b) =>
      b.addEventListener('click', () => {
        editing = data.sessions.find((s) => s.id === Number(b.dataset.editSession));
        dateEl.value = editing.date;
        renderEntries(editing.entries);
        $('#session-cancel').hidden = false;
        $('#session-h').textContent = '회차 수정';
        $('#session-h').scrollIntoView({ behavior: 'smooth' });
      }),
    );
    $('#session-cancel').addEventListener('click', () => location.reload());
    $$('[data-delete-session]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('이 회차를 삭제할까요? 벌금 합계에서 빠집니다.')) return;
        busy(b, () => call('DELETE', `/sessions/${b.dataset.deleteSession}`).then(() => done('삭제했어요'), (e) => toast(e.message)));
      }),
    );

    // 납부
    $('#pay-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      showErr($('#pay-err'), '');
      const btn = ev.target.querySelector('button');
      busy(btn, () =>
        call('POST', '/payments', { member_id: Number($('#pay-member').value), amount: Number($('#pay-amount').value) }).then(
          () => done('납부를 기록했어요'),
          (e) => showErr($('#pay-err'), e.message),
        ),
      );
    });
    $$('[data-delete-payment]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('이 납부 기록을 삭제할까요?')) return;
        busy(b, () => call('DELETE', `/payments/${b.dataset.deletePayment}`).then(() => done('삭제했어요'), (e) => toast(e.message)));
      }),
    );

    // 멤버
    $('#member-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      showErr($('#member-err'), '');
      const btn = ev.target.querySelector('button');
      busy(btn, () => call('POST', '/members', { name: $('#member-name').value }).then(() => done('추가했어요'), (e) => showErr($('#member-err'), e.message)));
    });
    $$('[data-hide-member]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('이 멤버를 내보낼까요? 지금까지 기록과 정산은 남아요.')) return;
        busy(b, () => call('DELETE', `/members/${b.dataset.hideMember}`).then(() => done('내보냈어요'), (e) => toast(e.message)));
      }),
    );

    $('#delete-group').addEventListener('click', (ev) => {
      if (!confirm(`"${data.group.name}" 모임을 삭제할까요? 되돌릴 수 없어요.`)) return;
      busy(ev.target, () => call('DELETE', '').then(() => (location.href = '/'), (e) => toast(e.message)));
    });
  }
})();
