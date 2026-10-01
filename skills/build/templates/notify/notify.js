// 알림 보내기 — 이메일(Resend, 무료 월 3,000통) · 앱 푸시(Expo, 무료). 서버에서만.
//   const n = createNotify({ env });  await n.email({ to, subject, html, key: 'receipt-<주문번호>' });  await n.push({ tokens, title, body });
// 원칙: 같은 알림을 두 번 보내지 않는다(key), 받는 사람이 끊을 수 있다(광고성은 수신 동의·"(광고)" 표시 — 정보통신망법), 실패해도 서비스는 계속.
const AD_RE = /(할인|이벤트|쿠폰|혜택|프로모션|광고)/;
export function createNotify({ env, fetch: f = fetch, log = () => {}, sent = new Set() }) {
  return {
    async email({ to, subject, html, key, marketing = false, unsubscribeUrl }) {
      if (!env.RESEND_API_KEY || !env.MAIL_FROM) { log({ event: 'notify_email_skipped', reason: 'no_key' }); return { ok: false, skipped: true }; }
      if (marketing && !/^\(광고\)/.test(subject)) subject = `(광고) ${subject}`; // 광고성 정보는 제목 앞에 (광고)
      if (!marketing && AD_RE.test(subject)) log({ event: 'notify_maybe_marketing', subject }); // 광고성인데 표시가 빠졌을 수 있음 — 검토
      if (marketing && !unsubscribeUrl) return { ok: false, error: '광고성 메일에는 수신 거부 링크가 필요해요' };
      if (key && sent.has(key)) return { ok: true, duplicate: true };
      const body = { from: env.MAIL_FROM, to: [].concat(to), subject, html: html + (unsubscribeUrl ? `<p style="color:#888;font-size:12px"><a href="${unsubscribeUrl}">수신 거부</a></p>` : '') };
      const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(body) });
      if (!r.ok) { log({ event: 'notify_email_failed', status: r.status }); return { ok: false, status: r.status }; }
      if (key) sent.add(key);
      log({ event: 'notify_email_sent' });
      return { ok: true };
    },
    // Expo 푸시: 앱이 등록한 ExponentPushToken[...] 목록. 100개씩 나눠 보낸다
    async push({ tokens, title, body, data }) {
      const valid = [].concat(tokens).filter((t) => /^Expo(nent)?PushToken\[.+\]$/.test(t));
      let ok = 0, invalid = [];
      for (let i = 0; i < valid.length; i += 100) {
        const chunk = valid.slice(i, i + 100);
        const r = await f('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(chunk.map((to) => ({ to, title, body, data, sound: 'default' }))) });
        const res = await r.json().catch(() => ({ data: [] }));
        (res.data ?? []).forEach((d, j) => { if (d.status === 'ok') ok++; else if (d.details?.error === 'DeviceNotRegistered') invalid.push(chunk[j]); });
      }
      log({ event: 'notify_push', ok, invalid: invalid.length });
      return { ok, invalid }; // invalid 토큰은 DB 에서 지운다(앱 삭제됨)
    },
  };
}
