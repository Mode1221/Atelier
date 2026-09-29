import { github } from './github.js';
import { anthropic, health, sentry, fly, vercel, stripe, metrics } from './others.js';

// 연결 화면 순서 = 이 배열 순서. 필수(GitHub, Claude)가 먼저.
export const SERVICES = [github, anthropic, health, metrics, sentry, fly, vercel, stripe];
export const serviceById = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

// 60초 캐시 — 외부 API 한도 보호, 화면은 빠르게
export function createCache(ttlMs = 60_000) {
  const m = new Map();
  return {
    async get(key, fn) {
      const hit = m.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const value = await fn();
      m.set(key, { at: Date.now(), value });
      return value;
    },
    clear: () => m.clear(),
  };
}
