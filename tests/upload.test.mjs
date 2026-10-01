// 파일 올리기 템플릿(templates/upload) — 가짜 R2 로 종류 확인·크기·총량·주인만 지우기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUploads, sniff } from '../skills/build/templates/upload/upload.js';

const fakeR2 = () => {
  const m = new Map();
  return { m, put: async (k, b, o) => m.set(k, { size: b.length, body: b, httpMetadata: o.httpMetadata }), get: async (k) => m.get(k) ?? null, delete: async (k) => m.delete(k),
    list: async ({ prefix }) => ({ objects: [...m].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, size: v.size })), truncated: false }) };
};
const PNG = (n = 100) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; };
const HTML = new TextEncoder().encode('<html><script>alert(1)</script>');

test('upload: 매직 바이트로 종류 판단(확장자·이름 무시), 허용 안 된 종류·빈 파일·큰 파일 거절', async () => {
  assert.equal(sniff(PNG()), 'image/png');
  assert.equal(sniff(new TextEncoder().encode('%PDF-1.7')), 'application/pdf');
  assert.equal(sniff(HTML), null);
  const up = createUploads({ bucket: fakeR2(), options: { maxBytes: 1000 } });
  assert.equal((await up.put({ customer: 'a', bytes: HTML, name: 'photo.png' })).status, 415);
  assert.equal((await up.put({ customer: 'a', bytes: new Uint8Array() })).status, 400);
  assert.equal((await up.put({ customer: 'a', bytes: PNG(2000) })).status, 413);
  const r = await up.put({ customer: 'a', bytes: PNG(), name: 'x.exe' });
  assert.equal(r.ok, true);
  assert.match(r.key, /^u\/[0-9a-f]{16}\/[0-9a-f-]{36}\.png$/);
  const g = await up.get(r.key);
  assert.equal(g.headers['content-type'], 'image/png');
  assert.equal(g.headers['x-content-type-options'], 'nosniff');
  assert.equal(await up.get('../secret'), null);
});

test('upload: 사용자별 총량, 내 파일 목록, 남의 파일은 못 지움', async () => {
  const bucket = fakeR2();
  const up = createUploads({ bucket, options: { perUserBytes: 250 } });
  const a1 = await up.put({ customer: 'a', bytes: PNG() });
  await up.put({ customer: 'a', bytes: PNG() });
  assert.equal((await up.put({ customer: 'a', bytes: PNG() })).status, 413);
  assert.equal((await up.put({ customer: 'b', bytes: PNG() })).ok, true, '다른 사람 총량은 따로');
  assert.equal((await up.mine('a')).length, 2);
  assert.equal((await up.remove({ customer: 'b', key: a1.key })).status, 403);
  assert.equal((await up.remove({ customer: 'a', key: a1.key })).ok, true);
  assert.equal(bucket.m.has(a1.key), false);
});
