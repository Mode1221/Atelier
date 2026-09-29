// E2E 용: 가짜 외부 서비스(5999) + HQ(3199) 를 함께 띄운다.
import { rmSync } from 'node:fs';
import { makeFakeWorld } from '../test/fakes.js';

const PROJECT = '# 벌금장부\n\n## 현재 단계\n- 단계: 6 출시 / L5 Go/No-Go\n\n## 사람 할 일\n- [ ] Fly.io 계정 만들기 — B12\n- [ ] 문의 이메일 만들기 — O4\n\n## 로드맵\n- [ ] I1\n';
const world = await makeFakeWorld({ projectMd: PROJECT });
const n1 = world.addIssue('카카오 로그인 배포', ['dept:dev', 'approval-needed']);
world.state.comments[n1].push({ body: '[결재 요청] 카카오 로그인 기능을 사용자에게 내보내기\n종류: 배포\n금액: 없음\n승인하면: 오늘 밤 새 버전이 나가요\n반려하면: 다음 주로 미뤄요' });
const n2 = world.addIssue('스레드 홍보 글 3개', ['dept:marketing', 'approval-needed']);
world.state.comments[n2].push({ body: '[결재 요청] 이번 주 스레드 홍보 글 3개 게시\n종류: 공개 게시\n금액: 없음\n승인하면: 월·수·금 오전에 게시돼요' });
world.addIssue('가입 화면 명세 쓰기', ['dept:plan', 'status:doing']);
world.addIssue('결석 체크 버튼 색 대비 고치기', ['dept:design', 'status:review']);
world.addIssue('정기 점검 실패 2026-09-29', ['dept:ops', 'ops-alert']);
world.addIssue('랜딩 문구 개선', ['dept:marketing'], '', 'closed');
await world.listen(5999);

const hosts = ['api.github.com', 'api.anthropic.com', 'sentry.io', 'api.machines.dev', 'api.vercel.com', 'api.stripe.com', 'status.example.com', 'metrics.example.com'];
process.env.HQ_TEST_HOSTS = JSON.stringify(Object.fromEntries(hosts.map((h) => [h, `http://127.0.0.1:5999/__host/${h}`])));
process.env.PORT = '3199';
process.env.DB_PATH = 'data/e2e/hq.db';
rmSync('data/e2e', { recursive: true, force: true });
await import('../src/server.js');
