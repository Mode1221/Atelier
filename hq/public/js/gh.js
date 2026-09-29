// GitHub API 클라이언트 (브라우저·Node 공용). 토큰은 api.github.com 으로만 보낸다.
import { sealForGitHub } from './sealed.js';

export class GhError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (data) => {
  const bin = atob(data.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
export { b64, unb64 };

export const DATA_BRANCH = 'atelier-data';

export function githubClient({ token, repo, apiBase = 'https://api.github.com', fetchImpl = (...a) => fetch(...a) }) {
  async function gh(path, { method = 'GET', body, raw404 = false } = {}) {
    let res;
    try {
      res = await fetchImpl(apiBase + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GhError('GitHub 에 연결하지 못했어요 (인터넷 연결을 확인해 주세요)');
    }
    if (res.status === 404 && raw404) return null;
    if (res.status === 401) throw new GhError('토큰이 올바르지 않거나 만료됐어요', 401);
    if (res.status === 403) throw new GhError('토큰 권한이 부족해요 (연결 도움말의 권한 목록을 확인해 주세요)', 403);
    if (res.status === 404) throw new GhError('찾을 수 없어요 (저장소 이름·권한을 확인해 주세요)', 404);
    if (!res.ok && res.status !== 409 && res.status !== 422) throw new GhError(`GitHub 오류 (${res.status})`, res.status);
    if (res.status === 409 || res.status === 422) throw new GhError('이미 있거나 충돌했어요', res.status);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const enc = encodeURIComponent;

  const client = {
    repo,
    repoInfo: () => gh(`/repos/${repo}`),
    async issues() {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [open, closed] = await Promise.all([gh(`/repos/${repo}/issues?state=open&per_page=100`), gh(`/repos/${repo}/issues?state=closed&since=${since}&per_page=30`)]);
      return [...open, ...closed].filter((i) => !i.pull_request);
    },
    comments: (n) => gh(`/repos/${repo}/issues/${n}/comments?per_page=100`),
    createIssue: (title, body, labels) => gh(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels } }),
    addLabels: (n, labels) => gh(`/repos/${repo}/issues/${n}/labels`, { method: 'POST', body: { labels } }),
    async removeLabel(n, label) {
      await gh(`/repos/${repo}/issues/${n}/labels/${enc(label)}`, { method: 'DELETE', raw404: true });
    },
    comment: (n, body) => gh(`/repos/${repo}/issues/${n}/comments`, { method: 'POST', body: { body } }),
    dispatch: (file, ref, inputs) => gh(`/repos/${repo}/actions/workflows/${enc(file)}/dispatches`, { method: 'POST', body: { ref, inputs } }),

    // --- 파일 (기본 브랜치 또는 데이터 브랜치)
    async file(path, ref) {
      const r = await gh(`/repos/${repo}/contents/${path}${ref ? `?ref=${enc(ref)}` : ''}`, { raw404: true });
      return r ? { sha: r.sha, text: unb64(r.content) } : null;
    },
    putFile: (path, text, message, sha, branch) =>
      gh(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: { message, content: b64(text), ...(sha ? { sha } : {}), ...(branch ? { branch } : {}) } }),

    // 데이터 브랜치의 모든 파일 경로 (실행 기록은 파일 이름에 담겨 있다)
    async dataPaths() {
      const t = await gh(`/repos/${repo}/git/trees/${DATA_BRANCH}?recursive=1`, { raw404: true });
      return t ? t.tree.filter((x) => x.type === 'blob').map((x) => x.path) : null;
    },
    // 코드와 섞이지 않는 빈 데이터 브랜치 만들기
    async createDataBranch(files) {
      const tree = await gh(`/repos/${repo}/git/trees`, {
        method: 'POST',
        body: { tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) },
      });
      const commit = await gh(`/repos/${repo}/git/commits`, { method: 'POST', body: { message: 'chore: Atelier 데이터 브랜치', tree: tree.sha, parents: [] } });
      await gh(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${DATA_BRANCH}`, sha: commit.sha } });
    },

    async ensureLabel(name, color, description) {
      try {
        await gh(`/repos/${repo}/labels`, { method: 'POST', body: { name, color, description } });
      } catch (e) {
        if (e.status !== 422) throw e;
      }
    },
    secretNames: async () => ((await gh(`/repos/${repo}/actions/secrets?per_page=100`))?.secrets ?? []).map((s) => s.name),
    async setSecret(name, value) {
      const { key_id, key } = await gh(`/repos/${repo}/actions/secrets/public-key`);
      await gh(`/repos/${repo}/actions/secrets/${name}`, { method: 'PUT', body: { encrypted_value: sealForGitHub(value, key), key_id } });
    },
    deleteSecret: (name) => gh(`/repos/${repo}/actions/secrets/${name}`, { method: 'DELETE', raw404: true }),
  };
  return client;
}
