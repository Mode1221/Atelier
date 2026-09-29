import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// 대시보드가 GitHub 에 설치하는 워크플로 = Atelier company 스킬의 템플릿 (npm run sync-template)
it('워크플로 템플릿이 스킬 원본과 같다', () => {
  const src = new URL('../../skills/company/templates/company.yml', import.meta.url);
  if (!existsSync(src)) return;
  expect(readFileSync(new URL('../templates/company.yml', import.meta.url), 'utf8')).toBe(readFileSync(src, 'utf8'));
});
