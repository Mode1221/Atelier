// build 스킬 템플릿: 로그인 검증(Supabase), 앱 첫 빌드(Expo)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken, requireUser, deleteUser, _clearCache } from '../skills/build/templates/auth/supabase-auth.js';

const URL_ = 'https://abcd.supabase.co';
const enc = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function keyPair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  const sign = async (claims, header = { alg: 'ES256', kid: 'k1', typ: 'JWT' }) => {
    const data = `${enc(header)}.${enc(claims)}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(data));
    return `${data}.${Buffer.from(sig).toString('base64url')}`;
  };
  return { jwk, sign };
}
const now = Date.parse('2026-09-30T00:00:00Z');
const good = { iss: `${URL_}/auth/v1`, sub: 'user-1', email: 'a@b.c', role: 'authenticated', exp: now / 1000 + 3600 };

test('supabase-auth: 올바른 토큰은 사용자, 위조·만료·다른 발급자·로그인 안 한 토큰은 거절', async () => {
  _clearCache();
  const { jwk, sign } = await keyPair();
  let jwksCalls = 0;
  const fetchImpl = async (u) => { jwksCalls++; assert.equal(u, `${URL_}/auth/v1/.well-known/jwks.json`); return Response.json({ keys: [jwk] }); };
  const opts = { url: URL_, fetchImpl, now };
  assert.deepEqual(await verifyToken(await sign(good), opts), { id: 'user-1', email: 'a@b.c', role: 'authenticated' });
  assert.equal((await verifyToken(await sign({ ...good, exp: now / 1000 - 1 }), opts)).error, 'expired');
  assert.equal((await verifyToken(await sign({ ...good, iss: 'https://evil.supabase.co/auth/v1' }), opts)).error, 'bad_issuer');
  assert.equal((await verifyToken(await sign({ ...good, role: 'anon' }), opts)).error, 'not_signed_in');
  const t = await sign(good);
  const forged = t.split('.').slice(0, 1).concat(enc({ ...good, sub: 'admin' }), t.split('.')[2]).join('.');
  assert.equal((await verifyToken(forged, opts)).error, 'bad_signature');
  assert.equal((await verifyToken(await sign(good, { alg: 'HS256', kid: 'k1' }), opts)).error, 'bad_alg');
  assert.equal((await verifyToken(await sign(good, { alg: 'ES256', kid: 'other' }), opts)).error, 'unknown_key');
  assert.equal((await verifyToken('', opts)).error, 'no_token');
  assert.equal((await verifyToken('a.b.c', opts)).error, 'bad_token');
  assert.equal(jwksCalls, 1, '공개키는 캐시');
  const req = new Request('https://x/api/me', { headers: { authorization: `Bearer ${t}` } });
  assert.equal((await requireUser(req, { SUPABASE_URL: URL_ }, { fetchImpl, now })).id, 'user-1');
});

test('supabase-auth: 탈퇴는 service role 키로 Supabase 계정 삭제', async () => {
  const seen = [];
  await deleteUser('user 1', { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: 'srk' }, async (u, init) => { seen.push([u, init.method, init.headers.apikey]); return new Response(null, { status: 200 }); });
  assert.deepEqual(seen, [[`${URL_}/auth/v1/admin/users/user%201`, 'DELETE', 'srk']]);
  await assert.rejects(deleteUser('x', { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: 'bad' }, async () => new Response(null, { status: 401 })), /401/);
});

import { appFirst, ensureEasJson, buildUrl } from '../skills/build/templates/app-first.mjs';
import { deployFirst } from '../skills/build/templates/deploy-first.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('app-first: 로그인 → 연결 → eas.json(APK) → 빌드 시작 → 주소, 연결돼 있으면 init 건너뜀', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'app-'));
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'a' } }));
  const calls = [];
  let logged = false;
  const run = async (args) => {
    calls.push(args[0]);
    if (args[0] === 'whoami') return { code: logged ? 0 : 1, out: logged ? 'me' : 'Not logged in' };
    if (args[0] === 'login') { logged = true; return { code: 0, out: '' }; }
    if (args[0] === 'init') { writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'a', extra: { eas: { projectId: 'p1' } } } })); return { code: 0, out: '' }; }
    if (args[0] === 'build') return { code: 0, out: JSON.stringify([{ id: 'b1', buildDetailsPageUrl: 'https://expo.dev/accounts/me/projects/a/builds/b1' }]) };
    return { code: 0, out: '' };
  };
  assert.equal(await appFirst({ run, dir, log: () => {} }), 'https://expo.dev/accounts/me/projects/a/builds/b1');
  assert.deepEqual(calls, ['whoami', 'login', 'init', 'build']);
  assert.equal(JSON.parse(readFileSync(join(dir, 'eas.json'), 'utf8')).build.preview.android.buildType, 'apk');
  calls.length = 0;
  await appFirst({ run, dir, log: () => {} });
  assert.deepEqual(calls, ['whoami', 'build']);
});

test('app-first: 사용자가 고친 eas.json 은 지키고 preview 만 채운다, 빌드 주소 해석', () => {
  const out = JSON.parse(ensureEasJson(JSON.stringify({ build: { production: { channel: 'prod' } } })));
  assert.equal(out.build.production.channel, 'prod');
  assert.equal(out.build.preview.android.buildType, 'apk');
  assert.equal(buildUrl('{"id":"x"}'), 'https://expo.dev/builds/x');
  assert.equal(buildUrl('not json'), null);
});

test('deploy-first: DB 없는 정적 웹·웹 게임은 DB 단계 없이 배포', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-'));
  writeFileSync(join(dir, 'wrangler.toml'), 'name = "my-game"\n[assets]\ndirectory = "./dist"\n');
  const calls = [];
  const run = async (args) => { calls.push(args[0]); return { code: 0, out: args[0] === 'deploy' ? 'https://my-game.me.workers.dev' : 'logged in' }; };
  assert.equal(await deployFirst({ run, file: join(dir, 'wrangler.toml'), log: () => {}, varsExample: join(dir, 'none') }), 'https://my-game.me.workers.dev');
  assert.deepEqual(calls, ['whoami', 'deploy']);
});

test('deploy-first: 파일 저장소(R2) 버킷이 없으면 만들고, 있으면 그대로, R2 미사용 계정은 할 일 안내', async () => {
  const { r2Buckets, r2Names } = await import('../skills/build/templates/deploy-first.mjs');
  assert.deepEqual(r2Buckets('[[r2_buckets]]\nbinding = "FILES"\nbucket_name = "shop-files"\n'), ['shop-files']);
  assert.deepEqual(r2Names('name:           a-files\ncreation_date:  x\n\nname:           b\n'), ['a-files', 'b']);
  const dir = mkdtempSync(join(tmpdir(), 'r2-'));
  writeFileSync(join(dir, 'wrangler.toml'), 'name = "shop"\n[[r2_buckets]]\nbinding = "FILES"\nbucket_name = "shop-files"\n');
  const calls = [];
  const run = async (args) => { calls.push(args.slice(0, 3).join(' ')); return { code: 0, out: args[0] === 'deploy' ? 'https://shop.me.workers.dev' : args[1] === 'bucket' && args[2] === 'list' ? 'name: other\n' : '' }; };
  await deployFirst({ run, file: join(dir, 'wrangler.toml'), log: () => {}, varsExample: join(dir, 'none') });
  assert.ok(calls.includes('r2 bucket create'));
  const run2 = async (args) => (args[2] === 'create' ? { code: 1, out: 'Please enable R2 through the Cloudflare Dashboard' } : { code: 0, out: '' });
  await assert.rejects(deployFirst({ run: run2, file: join(dir, 'wrangler.toml'), log: () => {}, varsExample: join(dir, 'none') }), /대시보드 → R2/);
});
