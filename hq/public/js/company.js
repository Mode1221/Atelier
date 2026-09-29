// 회사 도메인: 부서, 업무 보드, 결재, 대표 할 일, 종합 상태 (브라우저·Node 공용). 회사 세우기는 hqdata.js.
export const DEPTS = [
  { id: 'ceo', name: '대표실', role: '하루 계획과 주간 보고', when: '매일 아침 8시' },
  { id: 'plan', name: '기획', role: '무엇을 만들지 정하고 명세', when: '월·수 (할 일 있을 때)' },
  { id: 'design', name: '디자인', role: '화면·이미지·아이콘', when: '화·목 (할 일 있을 때)' },
  { id: 'dev', name: '개발', role: '기능 구현', when: '평일 오전 (할 일 있을 때)' },
  { id: 'qa', name: 'QA', role: '품질 검사', when: '매일 + 개발 결과가 올라올 때' },
  { id: 'security', name: '보안·법무', role: '보안 점검·약관', when: '금요일' },
  { id: 'marketing', name: '마케팅', role: '홍보 글·광고', when: '월·수·금 (할 일 있을 때)' },
  { id: 'support', name: '고객지원', role: '문의 정리·답변', when: '매일' },
  { id: 'ops', name: '운영', role: '서비스 상태·장애 대응', when: '매일' },
  { id: 'data', name: '데이터·재무', role: '지표·비용 보고', when: '월요일' },
];
export const DEPT_IDS = new Set(DEPTS.map((d) => d.id));
export const WORKFLOW_FILE = 'atelier-company.yml';

export const LABELS = [
  ...DEPTS.map((d) => [`dept:${d.id}`, '5319e7', `담당: ${d.name}`]),
  ['status:todo', 'ededed', '할 일'],
  ['status:doing', '1d76db', '진행 중'],
  ['status:review', 'fbca04', '검토 중'],
  ['approval-needed', 'd93f0b', '대표 결재 대기'],
  ['approved', '0e8a16', '대표 승인'],
  ['rejected', 'b60205', '대표 반려'],
  ['ops-alert', 'b60205', '정기 점검 실패'],
];

export const COLUMNS = [
  { id: 'todo', name: '할 일' },
  { id: 'doing', name: '진행 중' },
  { id: 'review', name: '검토 중' },
  { id: 'approval', name: '결재 대기' },
  { id: 'done', name: '완료 (최근 7일)' },
];

const names = (issue) => (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
export const deptOf = (issue) => names(issue).find((n) => n.startsWith('dept:'))?.slice(5) ?? null;

export function columnOf(issue) {
  const n = names(issue);
  if (issue.state === 'closed') return 'done';
  if (n.includes('approval-needed')) return 'approval';
  if (n.includes('status:review')) return 'review';
  if (n.includes('status:doing')) return 'doing';
  return 'todo';
}

export function buildBoard(issues) {
  const cols = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
  for (const i of issues) cols[columnOf(i)].push({ number: i.number, title: i.title, url: i.html_url, dept: deptOf(i), updated: i.updated_at, alert: names(i).includes('ops-alert') });
  return cols;
}

// 결재 요청 댓글 파싱 (skills/company/references/board.md 형식)
export function parseApproval(text) {
  if (!text || !text.includes('[결재 요청]')) return null;
  const body = text.slice(text.indexOf('[결재 요청]'));
  const line = (k) => body.match(new RegExp(`^${k}\\s*:\\s*(.+)$`, 'm'))?.[1].trim() ?? null;
  return {
    summary: body.split('\n')[0].replace('[결재 요청]', '').trim(),
    kind: line('종류'),
    amount: line('금액'),
    ifApproved: line('승인하면'),
    ifRejected: line('반려하면'),
    more: line('자세히'),
  };
}

export async function loadApprovals(gh, issues) {
  const waiting = issues.filter((i) => i.state === 'open' && names(i).includes('approval-needed')).slice(0, 20);
  return Promise.all(
    waiting.map(async (i) => {
      const comments = await gh.comments(i.number).catch(() => []);
      const req = [...comments].reverse().map((c) => parseApproval(c.body)).find(Boolean) ?? parseApproval(i.body) ?? { summary: i.title };
      return { number: i.number, title: i.title, url: i.html_url, dept: deptOf(i), since: i.updated_at, ...req };
    }),
  );
}

// PROJECT.md 의 "사람 할 일" 절 (Atelier pilot 형식)
export function parseHumanTasks(md) {
  if (!md) return [];
  const m = md.match(/^## 사람 할 일\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => /^- \[[ x]\] /.test(l) && !l.includes('(예)'))
    .map(({ l }) => ({ done: l.startsWith('- [x]'), text: l.replace(/^- \[[ x]\] /, '').trim() }));
}

export function markHumanTaskDone(md, text) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.startsWith('- [ ] ') && l.slice(6).trim() === text);
  if (i < 0) return null;
  lines[i] = `- [x] ${lines[i].slice(6)}`;
  return lines.join('\n');
}

export function currentStage(md) {
  return md?.match(/^## 현재 단계\s*\n- 단계:\s*(.+)$/m)?.[1].replace(/\*\*/g, '') ?? null;
}

// 오늘 회사 상태 — 가장 나쁜 신호가 전체를 정한다
export function overallStatus({ serviceSummaries = [], approvals = [], alerts = 0, budgetRatio = 0, githubError = null }) {
  const reasons = [];
  let level = 'good';
  const bump = (l) => {
    if (l === 'critical' || (l === 'warning' && level === 'good')) level = l;
  };
  if (githubError) {
    bump('critical');
    reasons.push({ level: 'critical', text: `업무 보드(GitHub)를 읽지 못했어요: ${githubError}` });
  }
  for (const s of serviceSummaries) {
    if (s.error) {
      bump('warning');
      reasons.push({ level: 'warning', text: `${s.name}: ${s.error}` });
    } else if (s.summary && s.summary.level !== 'good') {
      bump(s.summary.level);
      reasons.push({ level: s.summary.level, text: `${s.name}: ${s.summary.headline}` });
    }
  }
  if (alerts) {
    bump('critical');
    reasons.push({ level: 'critical', text: `정기 점검 실패 ${alerts}건 — 운영 부서가 확인 중이에요` });
  }
  if (approvals.length) {
    bump('warning');
    reasons.push({ level: 'warning', text: `결재를 기다리는 일이 ${approvals.length}건 있어요` });
  }
  if (budgetRatio >= 1) {
    bump('critical');
    reasons.push({ level: 'critical', text: '이번 달 AI 예산을 다 썼어요 — 부서 실행이 멈춰요' });
  } else if (budgetRatio >= 0.8) {
    bump('warning');
    reasons.push({ level: 'warning', text: `이번 달 AI 예산의 ${Math.round(budgetRatio * 100)}%를 썼어요` });
  }
  const headline = { good: '모두 순조로워요', warning: '확인할 일이 있어요', critical: '지금 문제가 있어요' }[level];
  return { level, headline, reasons };
}
