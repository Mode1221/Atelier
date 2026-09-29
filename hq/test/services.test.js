import { describe, it, expect, beforeAll } from 'vitest';
import { makeHttp } from '../src/services/http.js';
import { serviceById } from '../src/services/index.js';
import { monthCost } from '../src/services/others.js';
import { makeFakeWorld, GOOD } from './fakes.js';

let http;
beforeAll(async () => {
  http = makeHttp((await makeFakeWorld()).fetch);
});

describe('연동 서비스', () => {
  it('Claude 비용: 센트 문자열 합산 + 페이지 넘김', async () => {
    expect(await monthCost({ admin_key: 'sk-ant-admin-good' }, http)).toBeCloseTo(13.5);
  });
  it('Claude 키 확인 실패는 친절한 메시지', async () => {
    await expect(serviceById.anthropic.test({ api_key: 'bad' }, http)).rejects.toThrow('키가 올바르지 않거나 권한이 부족해요');
  });
  it('Sentry 오류 수', async () => {
    const s = await serviceById.sentry.summary({ org: 'o', project: 'p', token: GOOD }, http);
    expect(s).toMatchObject({ level: 'warning', value: 1 });
  });
  it('Fly 서버 상태 (stopped 는 대기로 정상)', async () => {
    const s = await serviceById.fly.summary({ app: 'a', token: GOOD }, http);
    expect(s.level).toBe('good');
    expect(s.headline).toContain('실행 중 1');
  });
  it('Vercel 최근 배포 실패 → critical', async () => {
    expect((await serviceById.vercel.summary({ project: 'p', token: GOOD }, http)).level).toBe('critical');
  });
  it('Stripe MRR: 월 9 + 연 120×2/12 = 29 USD', async () => {
    const s = await serviceById.stripe.summary({ key: GOOD }, http);
    expect(s.value).toBeCloseTo(29);
    expect(s.currency).toBe('USD');
  });
  it('헬스: 하나라도 실패면 critical', async () => {
    const s = await serviceById.health.summary({ urls: 'https://status.example.com/health\nhttps://status.example.com/down' }, http);
    expect(s.level).toBe('critical');
    expect(s.headline).toBe('1곳이 응답하지 않아요');
  });
  it('지표: 숫자만 가져온다', async () => {
    const s = await serviceById.metrics.summary({ url: 'https://metrics.example.com/stats' }, http);
    expect(s.items).toEqual([{ label: '주간 활성 모임', value: 12 }, { label: '이번 주 가입', value: 30 }]);
  });
  it('타임아웃', async () => {
    const slow = makeHttp((url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('abort')))));
    await expect(slow('https://x.test', { timeoutMs: 20 })).rejects.toThrow('연결하지 못했어요');
  });
});
