import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// 대시보드가 저장소에 설치하는 워크플로 = Atelier company 스킬의 원본 (npm run sync-template)
it('부서 워크플로 템플릿이 스킬 원본과 같다', () => {
  const src = new URL('../../skills/company/templates/company.yml', import.meta.url);
  if (!existsSync(src)) return;
  expect(readFileSync(new URL('../public/templates/company.yml', import.meta.url), 'utf8')).toBe(readFileSync(src, 'utf8'));
});
