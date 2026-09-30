// spec·build·guard 검사 스크립트 공통: 프로젝트 파일 목록 (node_modules 등 제외)
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.wrangler', 'data', 'test-results', 'playwright-report', 'dist', 'build', '.next', 'coverage', '.atelier']);
export function listFiles(root, { skip = SKIP } = {}) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.size < 2_000_000) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(root);
  return out;
}
export const isTest = (f) => /(^|\/)(test|tests|e2e|__tests__)\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
export const isCode = (f) => /\.(m?[jt]sx?|cjs|py|go|rb|kt|swift|dart|java|php|rs)$/.test(f);
