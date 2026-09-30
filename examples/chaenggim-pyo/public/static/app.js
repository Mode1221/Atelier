// 클라이언트 동작. "나는 누구"는 이 브라우저에만 저장(localStorage), 관리 키는 URL 조각(#k=)에만 두고 헤더로 보낸다.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const won = (n) => `${n.toLocaleString('ko-KR')}원`;
  const NET_ERR = '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요';
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* 개인 모드 등 — 이번 방문 동안만 기억 */
      }
    },
  };

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
  async function copyText(text, msg = '복사했어요') {
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
    toast(msg);
  }
  const canShare = typeof navigator.share === 'function';
  async function share({ title, text, url }) {
    if (canShare) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        return; // 사용자가 닫음
      }
    } else await copyText([text, url].filter(Boolean).join('\n'));
    fetch('/api/events/shared', { method: 'POST' }).catch(() => {});
  }

  $('#share-app')?.addEventListener('click', () =>
    share({ title: '챙김표', text: '캠핑·여행 준비물 누가 뭘 챙길지 링크 하나로 나누고 장본 돈까지 n빵. 가입 없음.', url: `${location.origin}/?ref=share` }),
  );

  // --- 의견 보내기
  const fbForm = $('#feedback-form');
  if (fbForm) {
    fbForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      showErr($('#fb-err'), '');
      busy(fbForm.querySelector('button[type=submit]'), async () => {
        try {
          await api('POST', '/api/feedback', {
            kind: fbForm.querySelector('input[name=kind]:checked')?.value,
            message: $('#fb-message').value,
            page: $('#fb-from').value,
            website: $('#fb-website').value,
          });
          fbForm.hidden = true;
          $('#fb-done').hidden = false;
          $('#fb-done h2').focus();
        } catch (e) {
          showErr($('#fb-err'), e.message);
        }
      });
    });
    return;
  }

  // --- 지표 화면
  const statsForm = $('#stats-form');
  if (statsForm) {
    const TOKEN_KEY = 'chaenggim:stats-token';
    const fromHash = new URLSearchParams(location.hash.slice(1)).get('t');
    const tokenEl = $('#stats-token');
    tokenEl.value = fromHash || store.get(TOKEN_KEY) || '';
    const cell = (text, cls) => Object.assign(document.createElement('td'), { textContent: text, className: cls || '' });
    async function show() {
      showErr($('#stats-err'), '');
      const token = tokenEl.value.trim();
      if (!token) return showErr($('#stats-err'), '지표 토큰을 넣어 주세요');
      const get = async (url) => {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
        if (!res) throw new Error(NET_ERR);
        if (res.status === 401) throw new Error('토큰이 맞지 않아요');
        if (!res.ok) throw new Error('잠시 문제가 생겼어요. 다시 시도해 주세요');
        return res.json();
      };
      try {
        const [kpis, { days }] = await Promise.all([get('/api/stats'), get('/api/stats/daily')]);
        store.set(TOKEN_KEY, token);
        const dl = $('#stats-kpis');
        dl.replaceChildren();
        for (const [k, v] of Object.entries(kpis)) {
          const box = document.createElement('div');
          box.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: Number(v).toLocaleString('ko-KR') }));
          dl.append(box);
        }
        const body = $('#stats-days');
        body.replaceChildren();
        for (const d of days) {
          const tr = document.createElement('tr');
          const rate = d.created ? Math.round((d.together / d.created) * 100) : 0;
          const bar = Object.assign(document.createElement('meter'), { min: 0, max: 100, value: rate });
          bar.setAttribute('aria-label', `${d.date} 함께 쓴 비율 ${rate}%`);
          const last = document.createElement('td');
          last.append(bar, ` ${rate}%`);
          tr.append(cell(d.date.slice(5)), cell(String(d.created), 'num'), cell(String(d.together), 'num'), cell(String(d.settled), 'num'), last);
          body.append(tr);
        }
        if (!days.length) body.innerHTML = '<tr><td colspan="5" class="muted">최근 14일 동안 만든 목록이 없어요</td></tr>';
        $('#stats-at').textContent = `불러온 시각 ${new Date().toLocaleString('ko-KR')}`;
        $('#stats-out').hidden = false;
      } catch (e) {
        showErr($('#stats-err'), e.message);
      }
    }
    statsForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      show();
    });
    if (tokenEl.value) show();
    return;
  }

  // --- 첫 화면: 목록 만들기
  const createForm = $('#create-form');
  if (createForm) {
    createForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const btn = createForm.querySelector('button[type=submit]');
      const body = { name: $('#name').value, starts_on: $('#starts_on').value || null, template: createForm.querySelector('input[name=template]:checked')?.value };
      for (const k of ['name', 'starts_on']) {
        $(`#${k}`).removeAttribute('aria-invalid');
        showErr($(`#${k}-err`), '');
      }
      showErr($('#form-err'), '');
      busy(btn, async () => {
        try {
          const { id, adminKey } = await api('POST', '/api/trips', body);
          location.href = `/t/${id}#k=${adminKey}`;
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

  // --- 목록 화면
  const dataEl = $('#data');
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const tid = data.trip.id;
  const key = new URLSearchParams(location.hash.slice(1)).get('k');
  const ME_KEY = `chaenggim:me:${tid}`;
  const people = new Map(data.people.map((p) => [p.id, p.name]));
  let me = Number(store.get(ME_KEY)) || null;
  let editing = false; // 고치는 중이면 자동 새로고침 대신 알림만
  if (me && !people.has(me)) me = null;

  // 쓰기 요청에는 "누가"(by)를 붙인다 — 최근 변경 기록에 이름이 남는다
  const call = (method, path, body) => api(method, `/api/trips/${tid}${path}`, method === 'GET' ? undefined : { ...(body ?? {}), by: me ?? undefined }, key);
  const reload = (msg) => {
    toast(msg);
    setTimeout(() => location.reload(), 400);
  };
  const inviteUrl = `${location.origin}/t/${tid}`;
  $('#invite-link').value = inviteUrl;
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText($(`#${b.dataset.copy}`).value)));

  // 나는 누구
  const meSel = $('#me');
  function setMe(id) {
    me = id;
    if (id) store.set(ME_KEY, String(id));
    meSel.value = id ? String(id) : '';
    $('#me-status').textContent = id ? `${people.get(id)}(으)로 참여 중이에요. 가져갈 준비물의 "내가 챙길게"를 눌러 주세요.` : '';
    const payer = $('#exp-payer');
    if (payer && id) payer.value = String(id);
    renderItems();
  }
  meSel.addEventListener('change', () => setMe(Number(meSel.value) || null));
  $('#join-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    showErr($('#join-err'), '');
    busy(ev.target.querySelector('button'), async () => {
      try {
        const p = await call('POST', '/people', { name: $('#join-name').value });
        store.set(ME_KEY, String(p.id));
        // 새로고침 전에도 바로 맡을 수 있게 지금 화면에 먼저 반영
        people.set(p.id, p.name);
        meSel.append(new Option(p.name, String(p.id)));
        setMe(p.id);
        reload(`${p.name}(으)로 참여했어요`);
      } catch (e) {
        showErr($('#join-err'), e.message);
      }
    });
  });

  // 준비물: 나에 따라 버튼이 달라진다
  const needMe = () => {
    toast('먼저 내 이름을 골라 주세요');
    $('#me-h').scrollIntoView({ behavior: 'smooth', block: 'center' });
    (people.size ? meSel : $('#join-name')).focus({ preventScroll: true });
  };
  function btn(label, aria, cls, onClick) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: cls });
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => onClick(b));
    return b;
  }
  function renderItems() {
    for (const li of $$('li.item')) {
      const id = Number(li.dataset.itemId);
      const owner = Number(li.dataset.claimedBy) || null;
      const name = li.dataset.name;
      const box = li.querySelector('.item-actions');
      box.replaceChildren();
      const act = (action, extra = {}) => (b) => {
        if (!me) return needMe();
        busy(b, () =>
          call('PATCH', `/items/${id}`, { action, person_id: me, ...extra }).then(
            () => reload({ claim: `${name} 맡았어요`, unclaim: '맡기를 취소했어요', pack: extra.packed ? '챙김 완료!' : '챙김 표시를 뺐어요' }[action]),
            (e) => (e.status === 409 ? reload(e.message) : toast(e.message)),
          ),
        );
      };
      if (!owner) box.append(btn('내가 챙길게', `${name} 내가 챙길게`, 'claim', act('claim')));
      else if (owner === me) {
        const packed = li.dataset.packed === '1';
        const p = btn(packed ? '챙김 ✓' : '챙겼어요', `${name} 챙겼어요`, packed ? 'packed' : '', act('pack', { packed: !packed }));
        p.setAttribute('aria-pressed', String(packed));
        box.append(p, btn('취소', `${name} 맡기 취소`, 'ghost', act('unclaim')));
      }
      if (!owner || owner === me)
        box.append(
          btn('고치기', `${name} 고치기`, 'ghost', () => openEdit(li)),
          btn('삭제', `${name} 삭제`, 'ghost', (b) => busy(b, () => call('DELETE', `/items/${id}`).then(() => reload('지웠어요 — "최근 변경"에서 되살릴 수 있어요'), (e) => toast(e.message)))),
        );
      li.classList.toggle('mine', !!owner && owner === me);
    }
    applyFilter();
  }
  // 준비물 이름·수량 고치기 (그 자리에서)
  function openEdit(li) {
    editing = true;
    const it = data.items.find((x) => x.id === Number(li.dataset.itemId));
    const form = document.createElement('form');
    form.className = 'row edit';
    form.noValidate = true;
    const uid = `e${it.id}`;
    form.innerHTML = `<div class="grow"><label for="${uid}-n">준비물 이름</label><input id="${uid}-n" type="text" maxlength="30"></div>
<div class="qty"><label for="${uid}-q">수량</label><input id="${uid}-q" type="number" inputmode="numeric" min="1" max="99"></div>
<div><button type="submit">저장</button></div><div><button type="button" class="ghost">취소</button></div>`;
    form.querySelector(`#${uid}-n`).value = it.name;
    form.querySelector(`#${uid}-q`).value = it.qty;
    const err = Object.assign(document.createElement('p'), { className: 'error', hidden: true });
    err.setAttribute('role', 'alert');
    li.replaceChildren(form, err);
    li.classList.add('editing');
    form.querySelector(`#${uid}-n`).focus();
    form.querySelector('button.ghost').addEventListener('click', () => location.reload());
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      showErr(err, '');
      busy(form.querySelector('button[type=submit]'), () =>
        call('PATCH', `/items/${it.id}`, { action: 'edit', name: form.querySelector(`#${uid}-n`).value, qty: Number(form.querySelector(`#${uid}-q`).value) }).then(
          () => reload('고쳤어요'),
          (e) => showErr(err, e.message),
        ),
      );
    });
  }
  function applyFilter() {
    const f = document.querySelector('input[name=filter]:checked')?.value ?? 'all';
    let shown = 0;
    for (const li of $$('li.item')) {
      const owner = Number(li.dataset.claimedBy) || null;
      const ok = f === 'all' || (f === 'open' && !owner) || (f === 'mine' && owner && owner === me);
      li.hidden = !ok;
      if (ok) shown += 1;
    }
    $('#filter-empty').hidden = shown > 0 || !$$('li.item').length;
  }
  $$('input[name=filter]').forEach((r) => r.addEventListener('change', applyFilter));

  const addItem = (form, input, errEl, kind, qtyEl) =>
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      showErr(errEl, '');
      busy(form.querySelector('button'), () =>
        call('POST', '/items', { name: input.value, qty: qtyEl ? Number(qtyEl.value) : 1, kind }).then(
          () => reload('추가했어요'),
          (e) => showErr(errEl, e.message),
        ),
      );
    });
  addItem($('#item-form'), $('#item-name'), $('#item-err'), 'shared', $('#item-qty'));
  addItem($('#personal-form'), $('#personal-name'), $('#personal-err'), 'personal');
  $$('[data-delete-item]').forEach((b) =>
    b.addEventListener('click', () => busy(b, () => call('DELETE', `/items/${b.dataset.deleteItem}`).then(() => reload('지웠어요 — "최근 변경"에서 되살릴 수 있어요'), (e) => toast(e.message)))),
  );
  // 되살리기 (최근 변경)
  $$('[data-restore]').forEach((b) =>
    b.addEventListener('click', () => {
      const [kind, id] = b.dataset.restore.split(':');
      busy(b, () => call('POST', `/${kind === 'item' ? 'items' : 'expenses'}/${id}/restore`).then(() => reload('되살렸어요'), (e) => toast(e.message)));
    }),
  );
  // 목록 이름·날짜 고치기
  $('#trip-edit').addEventListener('click', () => {
    editing = true;
    $('#trip-form').hidden = false;
    $('#trip-edit').hidden = true;
    $('#trip-name').focus();
  });
  $('#trip-cancel').addEventListener('click', () => location.reload());
  $('#trip-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    showErr($('#trip-err'), '');
    busy(ev.target.querySelector('button[type=submit]'), () =>
      call('PATCH', '', { name: $('#trip-name').value, starts_on: $('#trip-date').value || null }).then(() => reload('고쳤어요'), (e) => showErr($('#trip-err'), e.message)),
    );
  });

  // 장본 돈
  $('#expense-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    showErr($('#exp-err'), '');
    const body = {
      paid_by: Number($('#exp-payer').value),
      amount: Number($('#exp-amount').value),
      memo: $('#exp-memo').value,
      shares: $$('input[name=share]:checked').map((c) => Number(c.value)),
    };
    busy(ev.target.querySelector('button[type=submit]'), () => call('POST', '/expenses', body).then(() => reload('기록했어요'), (e) => showErr($('#exp-err'), e.message)));
  });
  $$('[data-delete-expense]').forEach((b) =>
    b.addEventListener('click', () => busy(b, () => call('DELETE', `/expenses/${b.dataset.deleteExpense}`).then(() => reload('지웠어요 — "최근 변경"에서 되살릴 수 있어요'), (e) => toast(e.message)))),
  );

  // 카톡용 현황
  function summaryText() {
    const shared = data.items.filter((i) => i.kind === 'shared');
    const open = shared.filter((i) => i.claimed_by == null).map((i) => i.name);
    const byOwner = new Map();
    for (const i of shared.filter((x) => x.claimed_by != null)) {
      const n = people.get(i.claimed_by) ?? '?';
      byOwner.set(n, [...(byOwner.get(n) ?? []), `${i.name}${i.packed ? '✓' : ''}`]);
    }
    return [
      `[${data.trip.name}] 준비물 현황`,
      open.length ? `아직 주인 없음: ${open.join(', ')}` : '준비물 주인이 모두 정해졌어요',
      ...[...byOwner].map(([n, list]) => `${n}: ${list.join(', ')}`),
      ...(data.moves.length ? ['', '장본 돈 보내기', ...data.moves.map((m) => `${m.from} → ${m.to} ${won(m.amount)}`)] : []),
    ].join('\n');
  }
  $('#copy-summary').addEventListener('click', () => {
    copyText(`${summaryText()}\n\n여기서 맡아 주세요: ${inviteUrl}`, '현황을 복사했어요. 단톡방에 붙여 넣으세요');
    fetch('/api/events/summary_copied', { method: 'POST' }).catch(() => {});
  });
  if (canShare) {
    $('#share-trip').hidden = false;
    $('#share-trip').addEventListener('click', () => share({ title: data.trip.name, text: summaryText(), url: inviteUrl }));
  }

  if (me) setMe(me);
  else {
    renderItems();
    $('#me-status').textContent = people.size ? '이름을 고르면 준비물을 맡을 수 있어요.' : '';
  }

  // 자동 새로고침: 화면이 보일 때 15초마다 "바뀌었나"만 확인 (D1 읽기 1번).
  // 입력 중이면 새로고침 대신 알림 막대. 20분 동안 손대지 않으면 멈췄다가 다시 만지면 이어서.
  let lastTouch = Date.now();
  const touched = () => {
    const idle = Date.now() - lastTouch > IDLE_MS;
    lastTouch = Date.now();
    if (idle) poll();
  };
  const IDLE_MS = 20 * 60_000;
  ['pointerdown', 'keydown', 'scroll'].forEach((t) => addEventListener(t, touched, { passive: true }));
  const busyTyping = () =>
    editing || $$('main input[type=text], main input[type=number]').some((i) => i === document.activeElement || (!i.readOnly && i.value && !['item-qty'].includes(i.id) && !i.closest('#trip-form')));
  let changed = false;
  $('#update-reload').addEventListener('click', () => location.reload());
  async function poll() {
    if (changed || document.hidden || Date.now() - lastTouch > IDLE_MS) return;
    try {
      const res = await fetch(`/api/trips/${tid}/version`);
      if (res.ok && (await res.json()).v !== data.trip.v) {
        changed = true;
        if (busyTyping()) $('#update-bar').hidden = false;
        else location.reload();
      }
    } catch {
      /* 잠깐 끊김 — 다음 번에 다시 */
    }
  }
  setInterval(poll, 15_000);
  document.addEventListener('visibilitychange', () => !document.hidden && poll());

  // 관리 링크
  if (!key) return;
  call('POST', '/auth')
    .then(() => {
      $$('.admin-only').forEach((el) => (el.hidden = false));
      $('#admin-link').value = `${inviteUrl}#k=${key}`;
      $$('[data-hide-person]').forEach((b) =>
        b.addEventListener('click', () => {
          if (!confirm('이 사람을 내보낼까요? 맡은 준비물은 다시 "아직 없음"이 되고, 낸 돈 기록은 남아요.')) return;
          busy(b, () => call('DELETE', `/people/${b.dataset.hidePerson}`).then(() => reload('내보냈어요'), (e) => toast(e.message)));
        }),
      );
      $('#delete-trip').addEventListener('click', (ev) => {
        if (!confirm(`"${data.trip.name}" 목록을 삭제할까요? 되돌릴 수 없어요.`)) return;
        busy(ev.target, () => call('DELETE', '').then(() => (location.href = '/'), (e) => toast(e.message)));
      });
    })
    .catch((e) => showErr($('#key-err'), e.network ? '연결을 확인해 주세요.' : '관리 링크가 올바르지 않아요. 참여 화면으로 보여 드려요.'));
})();
