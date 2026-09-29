// GitHub — 업무 보드(이슈), 결재(라벨), 부서 실행(Actions), 회사 세우기.
import sodium from 'libsodium-wrappers';

export const github = {
  id: 'github',
  name: 'GitHub',
  required: true,
  purpose: '회사의 업무 보드예요. 부서들이 여기서 일을 주고받고, 대표님은 결재만 하면 돼요.',
  fields: [
    { key: 'repo', label: '저장소 (소유자/이름)', placeholder: 'Mode1221/my-service', secret: false },
    { key: 'token', label: '접근 토큰', placeholder: 'github_pat_…', secret: true },
  ],
  howTo: [
    'GitHub 에 로그인한 뒤 Settings → Developer settings → Personal access tokens → Fine-grained tokens 로 가요.',
    '"Generate new token" 을 누르고, Repository access 에서 이 서비스의 저장소 하나만 골라요.',
    'Permissions 에서 Actions·Contents·Issues·Pull requests·Secrets·Variables·Workflows 를 "Read and write" 로 바꿔요.',
    '만들어진 토큰(github_pat_ 로 시작)을 복사해 여기에 붙여 넣어요.',
  ],
  async test(cfg, http) {
    const r = await gh(http, cfg, `/repos/${cfg.repo}`);
    return `${r.full_name} 연결됨 (기본 브랜치 ${r.default_branch})`;
  },
};

const API = 'https://api.github.com';
function gh(http, cfg, path, opts = {}) {
  return http(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'atelier-hq',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

export function githubClient(http, cfg) {
  const repo = cfg.repo;
  const enc = encodeURIComponent;
  return {
    repoInfo: () => gh(http, cfg, `/repos/${repo}`),
    async issues() {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [open, closed] = await Promise.all([
        gh(http, cfg, `/repos/${repo}/issues?state=open&per_page=100`),
        gh(http, cfg, `/repos/${repo}/issues?state=closed&since=${since}&per_page=30`),
      ]);
      return [...open, ...closed].filter((i) => !i.pull_request);
    },
    pulls: () => gh(http, cfg, `/repos/${repo}/pulls?state=open&per_page=30`),
    comments: (n) => gh(http, cfg, `/repos/${repo}/issues/${n}/comments?per_page=100`),
    addLabels: (n, labels) => gh(http, cfg, `/repos/${repo}/issues/${n}/labels`, { method: 'POST', body: { labels } }),
    async removeLabel(n, label) {
      try {
        await gh(http, cfg, `/repos/${repo}/issues/${n}/labels/${enc(label)}`, { method: 'DELETE' });
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    },
    createIssue: (title, body, labels) => gh(http, cfg, `/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels } }),
    comment: (n, body) => gh(http, cfg, `/repos/${repo}/issues/${n}/comments`, { method: 'POST', body: { body } }),
    workflowRuns: (file) => gh(http, cfg, `/repos/${repo}/actions/workflows/${enc(file)}/runs?per_page=30`).catch((e) => (e.status === 404 ? { workflow_runs: [] } : Promise.reject(e))),
    dispatch: (file, ref, inputs) => gh(http, cfg, `/repos/${repo}/actions/workflows/${enc(file)}/dispatches`, { method: 'POST', body: { ref, inputs } }),
    async file(path) {
      try {
        const r = await gh(http, cfg, `/repos/${repo}/contents/${path}`);
        return { sha: r.sha, text: Buffer.from(r.content, 'base64').toString('utf8') };
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    },
    putFile: (path, text, message, sha) =>
      gh(http, cfg, `/repos/${repo}/contents/${path}`, { method: 'PUT', body: { message, content: Buffer.from(text).toString('base64'), ...(sha ? { sha } : {}) } }),
    async ensureLabel(name, color, description) {
      try {
        await gh(http, cfg, `/repos/${repo}/labels`, { method: 'POST', body: { name, color, description } });
      } catch (e) {
        if (e.status !== 422) throw e; // 이미 있음
      }
    },
    async setVariable(name, value) {
      try {
        await gh(http, cfg, `/repos/${repo}/actions/variables`, { method: 'POST', body: { name, value } });
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
        await gh(http, cfg, `/repos/${repo}/actions/variables/${name}`, { method: 'PATCH', body: { name, value } });
      }
    },
    async setSecret(name, value) {
      await sodium.ready;
      const { key_id, key } = await gh(http, cfg, `/repos/${repo}/actions/secrets/public-key`);
      const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key, sodium.base64_variants.ORIGINAL));
      await gh(http, cfg, `/repos/${repo}/actions/secrets/${name}`, {
        method: 'PUT',
        body: { encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id },
      });
    },
  };
}
