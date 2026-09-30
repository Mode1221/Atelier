// Atelier beta 의 로컬 의견 가져오기(skills/beta/templates/feedback-pull.mjs)를 이 서비스 API 에 붙여 본다 — GitHub 없이.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openD1 } from '../src/d1-node.js';
import { createApp } from '../src/app.js';
import { pull } from '../../../skills/beta/templates/feedback-pull.mjs';

let app, env, root;
beforeEach(() => {
  env = { DB: openD1(), FEEDBACK_TOKEN: 'fb-secret' };
  app = createApp({ log: () => {}, trustProxyHeader: 'x-forwarded-for' });
  root = mkdtempSync(join(tmpdir(), 'pull-'));
  mkdirSync(join(root, 'company/chaenggim'), { recursive: true });
  writeFileSync(join(root, 'company/chaenggim/service.json'), JSON.stringify({ name: '챙김표', url: 'https://svc.test/' }));
  mkdirSync(join(root, '.atelier'));
  writeFileSync(join(root, '.atelier/secrets.json'), JSON.stringify({ FEEDBACK_TOKEN: 'fb-secret' }));
});
const fetchImpl = async (url, init = {}) => app.request(new URL(url).pathname, init, env);
const send = (body) => app.request('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' }, body: JSON.stringify(body) }, env);
const now = new Date('2026-09-30T01:00:00Z');

describe('의견 가져오기 (로컬 모드)', () => {
  it('새 의견을 company/<서비스>/feedback/<날짜>.json 에 모으고 다시 가져오지 않는다', async () => {
    await send({ kind: 'bug', message: '저장이 안 돼요 010-1234-5678', page: '/t/abc' });
    await send({ kind: 'idea', message: '엑셀 내보내기' });
    expect((await pull({ root, fetchImpl, now, env: {}, log: () => {} })).added).toBe(2);
    const doc = JSON.parse(readFileSync(join(root, 'company/chaenggim/feedback/2026-09-30.json'), 'utf8'));
    expect(doc).toMatchObject({ date: '2026-09-30', count: 2, status: 'new' });
    expect(doc.items[0]).toMatchObject({ kind: 'bug', page: '/t/:id' });
    expect(doc.items[0].message).not.toContain('1234-5678');
    expect((await pull({ root, fetchImpl, now, env: {}, log: () => {} })).added).toBe(0);
    await send({ kind: 'good', message: '' });
    await pull({ root, fetchImpl, now, env: {}, log: () => {} });
    expect(JSON.parse(readFileSync(join(root, 'company/chaenggim/feedback/2026-09-30.json'), 'utf8')).count).toBe(3);
  });

  it('열쇠가 없거나 틀리면 쉬운 말로 알려 준다', async () => {
    writeFileSync(join(root, '.atelier/secrets.json'), '{}');
    await expect(pull({ root, fetchImpl, now, env: {}, log: () => {} })).rejects.toThrow('deploy:first');
    await expect(pull({ root, fetchImpl, now, env: { FEEDBACK_TOKEN: 'wrong' }, log: () => {} })).rejects.toThrow('거절');
  });
});
