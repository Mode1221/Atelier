// Atelier beta 스킬의 피드백 수집기(skills/beta/templates/feedback-sync.mjs)를 이 서비스 API 에 붙여 본다.
import { describe, it, expect, beforeEach } from 'vitest';
import { openD1 } from '../src/d1-node.js';
import { createApp } from '../src/app.js';
import { sync, buildIssue, cell } from '../../../skills/beta/templates/feedback-sync.mjs';

let app, env, issues, labels;
beforeEach(() => {
  env = { DB: openD1(), FEEDBACK_TOKEN: 'fb-secret' };
  app = createApp({ log: () => {}, trustProxyHeader: 'x-forwarded-for' });
  issues = [];
  labels = [];
});

// 서비스 요청은 앱으로, GitHub 요청은 가짜로
const fetchImpl = async (url, init = {}) => {
  const u = new URL(url);
  if (u.host === 'svc.test') return app.request(u.pathname + u.search, init, env);
  const body = init.body ? JSON.parse(init.body) : null;
  if (u.pathname.endsWith('/labels')) {
    labels.push(body.name);
    return new Response('{}', { status: labels.filter((l) => l === body.name).length > 1 ? 422 : 201 });
  }
  if (u.pathname.endsWith('/issues')) {
    if (fetchImpl.failIssue) return new Response('{}', { status: 500 });
    issues.push(body);
    return new Response(JSON.stringify({ html_url: `https://github.com/o/r/issues/${issues.length}` }), { status: 201 });
  }
  return new Response('{}', { status: 404 });
};
const runEnv = { SERVICE_URL: 'https://svc.test/', FEEDBACK_TOKEN: 'fb-secret', GH_TOKEN: 'gh', REPO: 'o/r' };
const send = (body) => app.request('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' }, body: JSON.stringify(body) }, env);

describe('피드백 수집기', () => {
  it('새 피드백을 이슈 1건으로 옮기고 다시 옮기지 않는다', async () => {
    await send({ kind: 'bug', message: '저장이 안 돼요 @everyone | <b>', page: '/g/abc' });
    await send({ kind: 'good', message: '' });
    const r = await sync({ env: runEnv, fetchImpl, log: () => {} });
    expect(r.created).toBe(2);
    expect(issues[0].title).toMatch(/^베타 피드백 \d{4}-\d{2}-\d{2} \(2건\)$/);
    expect(issues[0].labels).toEqual(['feedback', 'dept:support']);
    expect(issues[0].body).toContain('저장이 안 돼요 &#64;everyone &#124; &lt;b&gt;');
    expect(issues[0].body).toContain('| /g/:id |');
    expect((await sync({ env: runEnv, fetchImpl, log: () => {} })).created).toBe(0);
    expect(issues).toHaveLength(1);
  });

  it('이슈 만들기가 실패하면 표시하지 않아 다음에 다시 옮긴다', async () => {
    await send({ kind: 'idea', message: '엑셀 내보내기' });
    fetchImpl.failIssue = true;
    await expect(sync({ env: runEnv, fetchImpl, log: () => {} })).rejects.toThrow('이슈 만들기 실패');
    fetchImpl.failIssue = false;
    expect((await sync({ env: runEnv, fetchImpl, log: () => {} })).created).toBe(1);
  });

  it('토큰이 없으면 건너뛰고, 틀리면 실패한다', async () => {
    expect((await sync({ env: { ...runEnv, FEEDBACK_TOKEN: '' }, fetchImpl, log: () => {} })).skipped).toBe(true);
    await expect(sync({ env: { ...runEnv, FEEDBACK_TOKEN: 'wrong' }, fetchImpl, log: () => {} })).rejects.toThrow('HTTP 401');
  });

  it('표 칸 이스케이프·요약', () => {
    expect(cell('a\nb`c')).toBe('a<br>b&#96;c');
    const { body } = buildIssue([{ id: 1, kind: 'hard', message: 'x', page: '/', created_at: '2026-09-29T01:02:03Z' }], { date: '2026-09-29' });
    expect(body).toContain('불편해요 1');
    expect(body).toContain('| 1 | 불편해요 | / | 2026-09-29 01:02 | x |');
  });
});
