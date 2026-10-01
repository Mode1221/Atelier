// 운영자 화면(templates/admin) · 알림(templates/notify)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './helpers/d1.mjs';
import { createAdmin } from '../skills/build/templates/admin/admin.js';
import { createNotify } from '../skills/build/templates/notify/notify.js';

test('admin: 적은 표만, 숨길 칸은 안 보이고, 검색·쪽 나눔·CSV(엑셀용 BOM), 표 이름으로 SQL 주입 불가', async () => {
  const db = fakeD1("CREATE TABLE orders (id TEXT, product TEXT, payment_key TEXT, created_at TEXT); CREATE TABLE secrets (v TEXT);");
  for (let i = 0; i < 60; i++) db.raw.prepare('INSERT INTO orders VALUES (?, ?, ?, ?)').run(`o${i}`, i % 2 ? '이용권' : '구독', 'pk_secret', `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`);
  const a = createAdmin({ db, tables: { orders: '주문' }, hide: ['payment_key'] });
  const r = await a.rows('orders');
  assert.deepEqual(r.columns, ['id', 'product', 'created_at']);
  assert.equal(r.rows.length, 50); assert.equal(r.total, 60); assert.equal(r.pages, 2);
  assert.equal(r.rows[0].id, 'o59', '최신 먼저');
  assert.equal((await a.rows('orders', { q: '이용권' })).total, 30);
  await assert.rejects(a.rows('secrets'), /볼 수 없는/);
  await assert.rejects(a.rows('orders; DROP TABLE orders'), /볼 수 없는/);
  const csv = await a.csv('orders', { q: '구독' });
  assert.ok(csv.startsWith('﻿"id","product","created_at"'));
  assert.equal(csv.split('\r\n').length, 31);
  assert.ok(!csv.includes('pk_secret'));
});

test('notify: 키 없으면 건너뜀, 같은 알림 한 번만, 광고성은 (광고)·수신 거부 필수, 푸시는 잘못된 토큰 골라냄', async () => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), h: init.headers }); return { ok: true, json: async () => ({ data: JSON.parse(init.body).map((m) => (m.to.includes('dead') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }) }; };
  assert.equal((await createNotify({ env: {}, fetch: f }).email({ to: 'a@b.c', subject: 's', html: 'h' })).skipped, true);
  const n = createNotify({ env: { RESEND_API_KEY: 'k', MAIL_FROM: '서비스 <no-reply@x.dev>' }, fetch: f });
  await n.email({ to: 'a@b.c', subject: '영수증', html: '<p>1</p>', key: 'receipt-1' });
  assert.equal((await n.email({ to: 'a@b.c', subject: '영수증', html: '<p>1</p>', key: 'receipt-1' })).duplicate, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].h['idempotency-key'], 'receipt-1');
  assert.match((await n.email({ to: 'a@b.c', subject: '이벤트', html: 'h', marketing: true })).error, /수신 거부/);
  await n.email({ to: 'a@b.c', subject: '가을 할인', html: 'h', marketing: true, unsubscribeUrl: 'https://x/u' });
  assert.equal(calls.at(-1).body.subject, '(광고) 가을 할인');
  assert.match(calls.at(-1).body.html, /수신 거부/);
  const p = await n.push({ tokens: ['ExponentPushToken[aa]', 'ExponentPushToken[dead]', 'junk'], title: 't', body: 'b' });
  assert.deepEqual(p, { ok: 1, invalid: ['ExponentPushToken[dead]'] });
});
