import { describe, it, expect } from 'vitest';
import { parseApproval, parseHumanTasks, markHumanTaskDone, currentStage, overallStatus, buildBoard, columnOf } from '../src/company.js';
import { encrypt, decrypt, hashPassword, verifyPassword, loadKey } from '../src/crypto.js';

describe('결재 요청 파싱', () => {
  it('board.md 형식을 읽는다', () => {
    const a = parseApproval('준비했어요.\n\n[결재 요청] 카카오 로그인 기능을 사용자에게 내보내기\n종류: 배포\n금액: 없음\n승인하면: 오늘 밤 배포돼요\n반려하면: 다음 주로 미뤄요\n자세히: https://x');
    expect(a).toEqual({ summary: '카카오 로그인 기능을 사용자에게 내보내기', kind: '배포', amount: '없음', ifApproved: '오늘 밤 배포돼요', ifRejected: '다음 주로 미뤄요', more: 'https://x' });
  });
  it('형식이 아니면 null', () => expect(parseApproval('그냥 댓글')).toBeNull());
});

describe('PROJECT.md', () => {
  const md = '# 앱\n\n## 현재 단계\n- 단계: 6 출시 / **L5**\n\n## 사람 할 일\nAI 가 할 수 없는 일.\n- [ ] (예) 무시\n- [ ] 호스팅 계정 만들기 — B12\n- [x] 도메인 사기\n\n## 로드맵\n- [ ] I1 문제 정의\n';
  it('사람 할 일만 읽는다 (로드맵·예시 제외)', () => {
    expect(parseHumanTasks(md)).toEqual([{ done: false, text: '호스팅 계정 만들기 — B12' }, { done: true, text: '도메인 사기' }]);
  });
  it('완료 표시는 정확히 그 줄만', () => {
    const next = markHumanTaskDone(md, '호스팅 계정 만들기 — B12');
    expect(next).toContain('- [x] 호스팅 계정 만들기 — B12');
    expect(next).toContain('- [ ] I1 문제 정의');
    expect(markHumanTaskDone(md, '없는 일')).toBeNull();
  });
  it('현재 단계', () => expect(currentStage(md)).toBe('6 출시 / L5'));
});

describe('보드·상태', () => {
  const L = (...n) => n.map((name) => ({ name }));
  it('라벨로 칸을 정한다', () => {
    expect(columnOf({ state: 'open', labels: L('dept:dev') })).toBe('todo');
    expect(columnOf({ state: 'open', labels: L('status:doing') })).toBe('doing');
    expect(columnOf({ state: 'open', labels: L('status:review', 'approval-needed') })).toBe('approval');
    expect(columnOf({ state: 'closed', labels: [] })).toBe('done');
    const b = buildBoard([{ number: 1, title: 't', state: 'open', labels: L('dept:qa', 'ops-alert') }]);
    expect(b.todo[0]).toMatchObject({ dept: 'qa', alert: true });
  });
  it('가장 나쁜 신호가 전체 상태', () => {
    expect(overallStatus({}).level).toBe('good');
    expect(overallStatus({ approvals: [{}] }).level).toBe('warning');
    expect(overallStatus({ approvals: [{}], serviceSummaries: [{ name: 'x', summary: { level: 'critical', headline: '다운' } }] }).level).toBe('critical');
    expect(overallStatus({ budgetRatio: 0.85 }).reasons[0].text).toContain('85%');
    expect(overallStatus({ budgetRatio: 1.2 }).level).toBe('critical');
  });
});

describe('암호화', () => {
  it('비밀값 왕복, 다른 키로는 실패', () => {
    const k = loadKey({ envValue: Buffer.alloc(32, 7).toString('base64') });
    const e = encrypt(k, { token: 'abc' });
    expect(JSON.stringify(e)).not.toContain('abc');
    expect(decrypt(k, e)).toEqual({ token: 'abc' });
    expect(() => decrypt(Buffer.alloc(32, 8), e)).toThrow();
  });
  it('비밀번호 해시', () => {
    const { salt, hash } = hashPassword('correct horse');
    expect(verifyPassword('correct horse', salt, hash)).toBe(true);
    expect(verifyPassword('wrong', salt, hash)).toBe(false);
  });
});
