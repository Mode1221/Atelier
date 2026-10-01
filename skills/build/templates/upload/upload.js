// 파일 올리기 (Cloudflare R2 — 무료 10GB/월, 내보내기 비용 없음). wrangler.toml:
//   [[r2_buckets]]  binding = "FILES"  bucket_name = "<서비스>-files"   (npm run deploy:first 가 버킷을 만든다)
// 원칙: 확장자·브라우저가 말한 종류를 믿지 않고 파일 앞부분(매직 바이트)으로 종류를 확인한다. 크기·사용자별 총량 제한, 올린 사람만 지움.
// 얼굴·신분증 같은 민감 사진을 받는다면 처리방침에 항목·보관 기간을 넣는다(guard G3).
export const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { ext: 'png', magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  'image/gif': { ext: 'gif', magic: [[0x47, 0x49, 0x46, 0x38]] },
  'image/webp': { ext: 'webp', magic: [[0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]] },
  'application/pdf': { ext: 'pdf', magic: [[0x25, 0x50, 0x44, 0x46, 0x2d]] },
};
export const DEFAULTS = { maxBytes: 5 * 1024 * 1024, perUserBytes: 50 * 1024 * 1024, allow: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] };

export function sniff(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const [type, { magic }] of Object.entries(TYPES)) if (magic.some((m) => m.every((v, i) => v === null || b[i] === v))) return type;
  return null;
}
const ownerOf = async (customer) => {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`owner:${customer}`)));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export function createUploads({ bucket, options = {} }) {
  const o = { ...DEFAULTS, ...options };
  async function usedBytes(prefix) {
    let total = 0, cursor;
    do { const l = await bucket.list({ prefix, cursor }); total += l.objects.reduce((s, x) => s + x.size, 0); cursor = l.truncated ? l.cursor : undefined; } while (cursor);
    return total;
  }
  return {
    // 올리기: bytes(ArrayBuffer/Uint8Array). 성공하면 { key, url, type, size }
    async put({ customer, bytes, name = '' }) {
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (!b.length) return { ok: false, status: 400, message: '빈 파일이에요.' };
      if (b.length > o.maxBytes) return { ok: false, status: 413, message: `파일이 너무 커요. ${Math.floor(o.maxBytes / 1048576)}MB 이하로 올려 주세요.` };
      const type = sniff(b);
      if (!type || !o.allow.includes(type)) return { ok: false, status: 415, message: `올릴 수 없는 파일이에요. ${o.allow.map((t) => TYPES[t].ext.toUpperCase()).join('·')} 만 돼요.` };
      const owner = await ownerOf(customer);
      if ((await usedBytes(`u/${owner}/`)) + b.length > o.perUserBytes) return { ok: false, status: 413, message: '올릴 수 있는 총 용량을 다 썼어요. 안 쓰는 파일을 지워 주세요.' };
      const key = `u/${owner}/${crypto.randomUUID()}.${TYPES[type].ext}`;
      await bucket.put(key, b, { httpMetadata: { contentType: type }, customMetadata: { name: String(name).slice(0, 120) } });
      return { ok: true, key, url: `/files/${key}`, type, size: b.length };
    },
    // 보여 주기: 저장할 때 확인한 종류로만 내보낸다(브라우저가 다른 종류로 해석하지 못하게)
    async get(key) {
      if (!/^u\/[0-9a-f]{16}\/[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/.test(key)) return null;
      const obj = await bucket.get(key);
      if (!obj) return null;
      const type = obj.httpMetadata?.contentType ?? 'application/octet-stream';
      return { body: obj.body, headers: { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=3600', 'content-disposition': type === 'application/pdf' ? 'attachment' : 'inline' } };
    },
    async remove({ customer, key }) {
      if (!key.startsWith(`u/${await ownerOf(customer)}/`)) return { ok: false, status: 403, message: '내가 올린 파일만 지울 수 있어요.' };
      await bucket.delete(key);
      return { ok: true };
    },
    async mine(customer) {
      const l = await bucket.list({ prefix: `u/${await ownerOf(customer)}/` });
      return l.objects.map((x) => ({ key: x.key, size: x.size, url: `/files/${x.key}` }));
    },
  };
}

// Hono 에 붙이기: mountUploads(app, { customerOf })  — 화면: <input type="file" accept="image/*,application/pdf">
export function mountUploads(app, { customerOf, options } = {}) {
  const up = (c) => createUploads({ bucket: c.env.FILES, options });
  app.post('/api/files', async (c) => {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') return c.json({ error: '파일을 골라 주세요.' }, 400);
    const r = await up(c).put({ customer: customerOf(c), bytes: new Uint8Array(await file.arrayBuffer()), name: file.name });
    return r.ok ? c.json(r) : c.json({ error: r.message }, r.status);
  });
  app.get('/files/*', async (c) => {
    const r = await up(c).get(c.req.path.replace(/^\/files\//, ''));
    return r ? new Response(r.body, { headers: r.headers }) : c.notFound();
  });
  app.delete('/api/files/*', async (c) => {
    const r = await up(c).remove({ customer: customerOf(c), key: c.req.path.replace(/^\/api\/files\//, '') });
    return r.ok ? c.json(r) : c.json({ error: r.message }, r.status);
  });
  app.get('/api/files', async (c) => c.json(await up(c).mine(customerOf(c))));
}
