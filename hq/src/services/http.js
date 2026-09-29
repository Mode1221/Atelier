// 외부 서비스 호출 공통: 타임아웃, JSON, 친절한 오류 메시지.
// HQ_TEST_HOSTS='{"api.github.com":"http://127.0.0.1:5999"}' — E2E 테스트에서만 가짜 서버로 돌린다.
const redirects = (() => {
  try {
    return JSON.parse(process.env.HQ_TEST_HOSTS || '{}');
  } catch {
    return {};
  }
})();

export class ServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function makeHttp(fetchImpl = globalThis.fetch) {
  return async function http(url, { method = 'GET', headers = {}, body, timeoutMs = 10_000, raw = false } = {}) {
    const u = new URL(url);
    if (redirects[u.host]) url = redirects[u.host] + u.pathname + u.search;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { method, headers, body, signal: ctrl.signal });
    } catch {
      throw new ServiceError('연결하지 못했어요 (네트워크 또는 주소 문제)');
    } finally {
      clearTimeout(t);
    }
    if (res.status === 401 || res.status === 403) throw new ServiceError('키가 올바르지 않거나 권한이 부족해요', res.status);
    if (res.status === 404) throw new ServiceError('찾을 수 없어요 (이름·주소를 확인해 주세요)', 404);
    if (res.status === 429) throw new ServiceError('요청이 너무 많아요. 잠시 후 다시 확인해요', 429);
    if (!res.ok && !raw) throw new ServiceError(`서비스 오류 (${res.status})`, res.status);
    if (raw) return res;
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}
