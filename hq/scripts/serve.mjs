// 로컬 실행용 정적 서버. FAKE=1 이면 가짜 GitHub·Claude 를 같은 주소의 /__fake/<호스트>/ 아래에 붙인다 (E2E·화면 확인용).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 3100);
const ROOT = new URL('../public/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.yml': 'text/plain; charset=utf-8', '.json': 'application/json' };

let world = null;
if (process.env.FAKE === '1') {
  const { makeFakeWorld } = await import('../test/fakes.js');
  const PROJECT = '# 벌금장부\n\n## 현재 단계\n- 단계: 6 출시 / L1 사용성 테스트\n\n## 사람 할 일\n- [ ] 사용성 테스트 5명 — L1\n- [ ] 비공개 베타 5~10개 모임 — L2\n\n## 로드맵\n- [ ] I1\n';
  world = await makeFakeWorld({ projectMd: PROJECT });
  const n1 = world.addIssue('카카오 로그인 배포', ['dept:dev', 'approval-needed']);
  world.state.comments[n1].push({ body: '[결재 요청] 카카오 로그인 기능을 사용자에게 내보내기\n종류: 배포\n금액: 없음\n승인하면: 오늘 밤 새 버전이 나가요\n반려하면: 다음 주로 미뤄요' });
  const n2 = world.addIssue('스레드 홍보 글 3개', ['dept:marketing', 'approval-needed']);
  world.state.comments[n2].push({ body: '[결재 요청] 이번 주 스레드 홍보 글 3개 게시\n종류: 공개 게시\n금액: 없음\n승인하면: 월·수·금 오전에 게시돼요' });
  world.addIssue('가입 화면 명세 쓰기', ['dept:plan', 'status:doing']);
  world.addIssue('결석 체크 버튼 색 대비 고치기', ['dept:design', 'status:review']);
  world.addIssue('정기 점검 실패 2026-09-29', ['dept:ops', 'ops-alert']);
  world.addIssue('랜딩 문구 개선', ['dept:marketing'], '', 'closed');
  world.addIssue('베타 피드백 2026-09-29 (3건)', ['feedback', 'dept:support']);
  const posts = { product: '벌금장부 공개 베타', url: 'https://beolgeum.example/', campaign: 'open-beta', posts: [
    { channel: 'threads', when: 'D-day', text: '스터디 벌금 계산기 공개 베타 열었어요.' },
    { channel: 'kakaotalk', text: '스터디 벌금 정산 무료 웹이에요.' },
  ] };
  world.state.files['docs/share/posts.json'] = { text: JSON.stringify(posts), sha: 'shaP' };
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (world && url.pathname.startsWith('/__fake/')) {
    let data = '';
    for await (const c of req) data += c;
    const [, , host, ...rest] = url.pathname.split('/');
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]));
    const r = world.handle(req.method, `https://${host}/${rest.join('/')}${url.search}`, headers, data ? JSON.parse(data) : null);
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    return res.end(r.body == null ? '' : JSON.stringify(r.body));
  }
  if (world && url.pathname === '/__fake-state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const state = { ...world.state, labels: [...world.state.labels] };
    delete state.keypair;
    return res.end(JSON.stringify(state));
  }
  const rel = normalize(url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Atelier HQ: http://127.0.0.1:${PORT}${world ? ' (가짜 GitHub)' : ''}`));
