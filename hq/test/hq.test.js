import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers';
import { sealForGitHub } from '../public/js/sealed.js';
import { githubClient } from '../public/js/gh.js';
import { parseRuns, normalizeSettings, bootstrap, saveSettings } from '../public/js/hqdata.js';
import { collect, writeStatus } from '../public/templates/collect.mjs';
import { makeFakeWorld, GOOD } from './fakes.js';

describe('비밀값 봉인 (브라우저용 tweetnacl 구현 ↔ libsodium 호환)', () => {
  it('libsodium crypto_box_seal_open 으로 열린다', async () => {
    await sodium.ready;
    const kp = sodium.crypto_box_keypair();
    const pk = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
    const sealed = sealForGitHub('비밀-값 sk-ant-123', pk);
    const opened = sodium.crypto_box_seal_open(sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey);
    expect(sodium.to_string(opened)).toBe('비밀-값 sk-ant-123');
  });
});

describe('실행 기록·설정', () => {
  it('파일 이름으로 이번 달 부서별 비용과 마지막 실행을 계산', () => {
    const now = new Date('2026-09-29T00:00:00Z');
    const r = parseRuns(['runs/2026-09/dev__100__0.5000__success.json', 'runs/2026-09/dev__120__1.2500__failure.json', 'runs/2026-08/dev__90__9.0000__success.json', 'runs/2026-09/qa__110__0.1000__success.json', 'hq.json'], now);
    expect(r.perDept.dev).toEqual({ usd: 1.75, runs: 2 });
    expect(r.perDept.qa.runs).toBe(1);
    expect(r.last.dev).toMatchObject({ runId: '120', status: 'failure' });
  });
  it('설정은 모르는 부서·음수 예산을 걸러낸다', () => {
    const s = normalizeSettings({ company: ' 벌금장부 ', budgets: { dev: 5, hacker: 1, qa: -1 }, paused: ['dev', 'x'], rate: 'abc' });
    expect(s).toMatchObject({ company: '벌금장부', rate: 1400, paused: ['dev'] });
    expect(s.budgets.dev).toBe(5);
    expect(s.budgets.qa).toBe(10);
    expect(s.budgets.hacker).toBeUndefined();
  });
});

describe('회사 세우기 (가짜 GitHub)', () => {
  let world, gh;
  beforeAll(async () => {
    world = await makeFakeWorld();
    gh = githubClient({ token: GOOD, repo: 'o/r', fetchImpl: world.fetch });
  });
  it('라벨·워크플로 3개·데이터 브랜치·AI 키를 설치하고, 두 번째엔 할 일이 없다', async () => {
    const templates = { company: 'name: company\n', collectYml: 'name: collect\n', collectJs: '// collect\n' };
    const steps = await bootstrap({ gh, templates, anthropicKey: 'sk-ant-api-good', settings: normalizeSettings({ company: '테스트' }) });
    expect(steps.join(' ')).toContain('데이터 보관용 브랜치');
    expect(world.state.files['.github/workflows/atelier-company.yml'].text).toBe('name: company\n');
    expect(world.state.files['.github/atelier/collect.mjs'].text).toBe('// collect\n');
    expect(JSON.parse(world.state.branches['atelier-data']['hq.json'].text).company).toBe('테스트');
    expect(world.state.secrets.ANTHROPIC_API_KEY).toBe('sk-ant-api-good');
    expect(world.state.labels.has('approval-needed')).toBe(true);
    expect(await bootstrap({ gh, templates, settings: normalizeSettings(null) })).toEqual(['라벨 17개 준비', '이미 최신이에요']);
  });
  it('설정 저장은 데이터 브랜치의 hq.json 을 갱신', async () => {
    await saveSettings(gh, { company: '새 이름', budgets: { dev: 3 }, paused: ['marketing'] });
    const saved = JSON.parse(world.state.branches['atelier-data']['hq.json'].text);
    expect(saved).toMatchObject({ company: '새 이름', paused: ['marketing'] });
    expect(saved.budgets.dev).toBe(3);
  });
});

describe('상태 수집기 (collect.mjs)', () => {
  it('비밀값이 있는 서비스만 조회하고, 실패는 오류로 남긴다', async () => {
    const world = await makeFakeWorld();
    const env = {
      ATELIER_SVC_ANTHROPIC: JSON.stringify({ admin_key: 'sk-ant-admin-good' }),
      ATELIER_SVC_HEALTH: JSON.stringify({ urls: 'https://status.example.com/health https://status.example.com/down' }),
      ATELIER_SVC_SENTRY: JSON.stringify({ org: 'o', project: 'p', token: 'bad' }),
      ATELIER_SVC_STRIPE: JSON.stringify({ key: GOOD }),
    };
    const s = await collect({ env, fetchImpl: world.fetch });
    expect(s.services.anthropic.summary.value).toBeCloseTo(13.5);
    expect(s.services.health.summary.level).toBe('critical');
    expect(s.services.sentry.error).toContain('키가 올바르지 않거나');
    expect(s.services.stripe.summary.value).toBeCloseTo(29);
    expect(s.services.fly).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain('sk-ant-admin-good');
  });
  it('status.json 을 데이터 브랜치에 쓴다 (있으면 갱신)', async () => {
    const world = await makeFakeWorld();
    world.state.branches['atelier-data'] = {};
    await writeStatus({ at: 'x', services: {} }, { repo: 'o/r', token: GOOD, fetchImpl: world.fetch });
    await writeStatus({ at: 'y', services: {} }, { repo: 'o/r', token: GOOD, fetchImpl: world.fetch });
    expect(JSON.parse(world.state.branches['atelier-data']['status.json'].text).at).toBe('y');
  });
});
