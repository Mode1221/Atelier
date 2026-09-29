// GitHub 비밀값 등록용 봉인 상자 (libsodium crypto_box_seal 과 같은 형식).
// scripts/build-vendor.mjs 가 이 파일을 public/js/sealed.js 로 묶는다 (브라우저에서 빌드 없이 쓰기 위해).
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

// 난수: 브라우저·Node(22+) 모두 globalThis.crypto 를 쓴다
nacl.setPRNG((x, n) => {
  const v = globalThis.crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) x[i] = v[i];
});

function fromB64(s) {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// 봉인: 임시 키쌍 + nonce = BLAKE2b(임시 공개키 || 받는 쪽 공개키, 24바이트)
export function seal(message, recipientPublicKey) {
  const eph = nacl.box.keyPair();
  const nonceInput = new Uint8Array(64);
  nonceInput.set(eph.publicKey, 0);
  nonceInput.set(recipientPublicKey, 32);
  const nonce = blake2b(nonceInput, undefined, 24);
  const boxed = nacl.box(message, nonce, recipientPublicKey, eph.secretKey);
  const out = new Uint8Array(32 + boxed.length);
  out.set(eph.publicKey, 0);
  out.set(boxed, 32);
  return out;
}

export function sealForGitHub(value, publicKeyB64) {
  return toB64(seal(new TextEncoder().encode(value), fromB64(publicKeyB64)));
}
