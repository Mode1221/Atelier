#!/usr/bin/env node
// Atelier share — posts.json 의 bluesky 글을 공식 API 로 게시한다 (무료, 약관 허용).
// 이미 같은 글이 계정에 있으면 건너뛴다 → 여러 번 실행해도 한 번만 올라간다.
// 환경변수: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD (bsky.app → 설정 → 앱 비밀번호). 없으면 건너뜀.
// 사용: node post-bluesky.mjs [posts.json=docs/share/posts.json]
import { readFileSync } from 'node:fs';
import { withUtm } from './channels.mjs';

const PDS = 'https://bsky.social/xrpc';

// 본문 + 링크, 링크 부분에 facet(바이트 위치) — 그래야 링크가 눌린다
export function buildRecord(text, url, now = new Date()) {
  const full = `${text}\n${url}`;
  const enc = new TextEncoder();
  const byteStart = enc.encode(`${text}\n`).length;
  return {
    $type: 'app.bsky.feed.post',
    text: full,
    createdAt: now.toISOString(),
    langs: ['ko'],
    facets: [{ index: { byteStart, byteEnd: byteStart + enc.encode(url).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] }],
  };
}

export async function postAll(spec, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const { BLUESKY_HANDLE: identifier, BLUESKY_APP_PASSWORD: password } = env;
  const posts = (spec.posts ?? []).filter((p) => p.channel === 'bluesky');
  if (!identifier || !password) {
    log('BLUESKY_HANDLE / BLUESKY_APP_PASSWORD 가 없어 건너뜁니다.');
    return { skipped: true, posted: 0 };
  }
  if (!posts.length) {
    log('bluesky 글이 없어요.');
    return { posted: 0 };
  }
  const call = async (method, path, body, token) => {
    const r = await fetchImpl(`${PDS}/${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`Bluesky ${path}: HTTP ${r.status}`);
    return r.json();
  };
  const session = await call('POST', 'com.atproto.server.createSession', { identifier, password });
  const feed = await call('GET', `app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(session.did)}&limit=100`, null, session.accessJwt);
  const existing = new Set((feed.feed ?? []).map((f) => f.post?.record?.text?.split('\n').slice(0, -1).join('\n')));
  let posted = 0;
  for (const p of posts) {
    if (existing.has(p.text)) {
      log(`이미 올림: ${p.text.slice(0, 30)}…`);
      continue;
    }
    const url = withUtm(p.url ?? spec.url, 'bluesky', spec.campaign);
    const r = await call('POST', 'com.atproto.repo.createRecord', { repo: session.did, collection: 'app.bsky.feed.post', record: buildRecord(p.text, url) }, session.accessJwt);
    log(`게시: ${r.uri}`);
    posted++;
  }
  return { posted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const spec = JSON.parse(readFileSync(process.argv[2] ?? 'docs/share/posts.json', 'utf8'));
  postAll(spec).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
