// 비밀값 암호화(AES-256-GCM), 비밀번호 해시(scrypt), 토큰.
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// HQ_SECRET(32바이트 base64) 가 없으면 데이터 폴더에 키 파일을 만든다 — 운영에선 환경변수로 따로 두는 것을 권장
export function loadKey({ envValue = process.env.HQ_SECRET, keyFile }) {
  if (envValue) {
    const k = Buffer.from(envValue, 'base64');
    if (k.length !== 32) throw new Error('HQ_SECRET 은 32바이트 base64 여야 합니다');
    return k;
  }
  if (keyFile) {
    if (!existsSync(keyFile)) {
      mkdirSync(dirname(keyFile), { recursive: true });
      writeFileSync(keyFile, randomBytes(32).toString('base64'), { mode: 0o600 });
    }
    return Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'base64');
  }
  return randomBytes(32); // 테스트용 — 재시작하면 복호화 불가
}

export function encrypt(key, obj) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decrypt(key, { iv, tag, data }) {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}

export function hashPassword(password, salt = randomBytes(16).toString('base64')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('base64') };
}

export function verifyPassword(password, salt, hash) {
  const a = scryptSync(String(password), salt, 64);
  const b = Buffer.from(hash, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(sha256(String(a ?? '')));
  const y = Buffer.from(sha256(String(b ?? '')));
  return timingSafeEqual(x, y) && a === b;
}
