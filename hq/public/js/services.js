// 연결 화면의 서비스 목록. 키는 GitHub 비밀값으로만 저장한다 (브라우저에 남기지 않음).
// 상태 조회는 저장소의 atelier-collect 워크플로가 한다 (templates/collect.mjs).
const svcSecret = (id) => `ATELIER_SVC_${id.toUpperCase()}`;
const base = (id) => ({ id, secretName: (names) => names.includes(svcSecret(id)), secrets: (cfg) => ({ [svcSecret(id)]: JSON.stringify(cfg) }) });

export const SERVICES = {
  anthropic: {
    ...base('anthropic'),
    name: 'Claude (AI 직원)',
    required: true,
    purpose: 'AI 부서들이 일할 때 쓰는 키예요. 관리자 키를 넣으면 이번 달 AI 사용료도 보여 드려요.',
    fields: [
      { key: 'api_key', label: 'API 키 (부서 실행용)', placeholder: 'sk-ant-api…', secret: true },
      { key: 'admin_key', label: '관리자 키 (비용 조회용)', placeholder: 'sk-ant-admin…', secret: true, optional: true },
    ],
    howTo: [
      'platform.claude.com 에 로그인해요.',
      'Settings → API keys 에서 "Create Key" 로 API 키를 만들어 복사해요.',
      '(선택) 조직 관리자라면 Settings → Admin keys 에서 관리자 키를 만들어요. 비용 조회에만 써요.',
    ],
    browserTest: true,
    // 부서 실행용 키는 워크플로가 바로 쓰는 ANTHROPIC_API_KEY 로, 관리자 키는 수집기용으로
    secretName: (names) => names.includes('ANTHROPIC_API_KEY'),
    secrets: (cfg) => ({ ANTHROPIC_API_KEY: cfg.api_key, ...(cfg.admin_key ? { [svcSecret('anthropic')]: JSON.stringify({ admin_key: cfg.admin_key }) } : {}) }),
  },
  health: {
    ...base('health'),
    name: '서비스 상태 확인',
    purpose: '서비스 주소에 주기적으로 접속해 살아 있는지 봐요. 키가 필요 없어요.',
    fields: [{ key: 'urls', label: '확인할 주소 (한 줄에 하나)', placeholder: 'https://my-service.workers.dev/health', multiline: true }],
    howTo: ['서비스의 상태 확인 주소(보통 /health)를 적어요.'],
  },
  metrics: {
    ...base('metrics'),
    name: '서비스 지표',
    purpose: '서비스가 제공하는 숫자(가입자, 활성 사용자 등)를 홈에 보여 줘요.',
    fields: [
      { key: 'url', label: '지표 주소 (JSON)', placeholder: 'https://my-service.workers.dev/api/stats' },
      { key: 'token', label: '토큰 (필요하면)', placeholder: '', secret: true, optional: true },
    ],
    howTo: ['개발 부서에 "지표 주소 만들어 줘"라고 이슈를 만들면 돼요.', '주소는 {"주간 활성 모임": 12} 같은 숫자 모음을 돌려주면 돼요.'],
  },
  sentry: {
    ...base('sentry'),
    name: 'Sentry (오류 알림)',
    purpose: '사용자 화면에서 생긴 오류를 모아 보여 줘요.',
    fields: [
      { key: 'org', label: '조직 이름(slug)', placeholder: 'my-org' },
      { key: 'project', label: '프로젝트 이름(slug)', placeholder: 'my-service' },
      { key: 'token', label: '인증 토큰', placeholder: 'sntryu_…', secret: true },
    ],
    howTo: ['sentry.io → Settings → Auth Tokens 에서 project:read 권한 토큰을 만들어요.', '주소창의 조직·프로젝트 이름을 적어요.'],
  },
  fly: {
    ...base('fly'),
    name: 'Fly.io (서버)',
    purpose: '서비스가 돌아가는 서버 상태를 보여 줘요. (유료 호스팅 — 무료로 쓰려면 Cloudflare 를 권해요)',
    fields: [
      { key: 'app', label: '앱 이름', placeholder: 'my-service' },
      { key: 'token', label: '토큰', placeholder: 'FlyV1 …', secret: true },
    ],
    howTo: ['fly.io 대시보드 → 앱 → Tokens 에서 읽기 전용 토큰을 만들어요.'],
  },
  vercel: {
    ...base('vercel'),
    name: 'Vercel (웹 배포)',
    purpose: '웹사이트 최근 배포가 성공했는지 보여 줘요.',
    fields: [
      { key: 'project', label: '프로젝트 ID', placeholder: 'prj_…' },
      { key: 'token', label: '토큰', placeholder: '', secret: true },
      { key: 'team', label: '팀 ID (팀 계정이면)', placeholder: 'team_…', optional: true },
    ],
    howTo: ['vercel.com → Account Settings → Tokens 에서 토큰을 만들어요.', '프로젝트 Settings → General 에서 Project ID 를 복사해요.'],
  },
  stripe: {
    ...base('stripe'),
    name: 'Stripe (결제·매출)',
    purpose: '구독 매출(월 반복 매출)과 유료 고객 수를 보여 줘요.',
    fields: [{ key: 'key', label: '제한된 키 (읽기 전용)', placeholder: 'rk_live_…', secret: true }],
    howTo: ['dashboard.stripe.com → Developers → API keys → "Create restricted key" 로 Subscriptions 읽기 권한만 준 키를 만들어요. (비밀 키 sk_ 는 넣지 마세요)'],
  },
};
