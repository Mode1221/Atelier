// legal/*.md → src/legal.gen.js (Workers 에서는 파일을 읽을 수 없어 문자열로 묶는다). 문서를 고치면 다시 실행.
import { readFileSync, writeFileSync } from 'node:fs';

const docs = { privacy: 'legal/privacy-policy.md', terms: 'legal/terms.md' };
const out = `// 자동 생성 — 직접 고치지 말고 legal/*.md 를 고친 뒤 node scripts/gen-legal.mjs\nexport const LEGAL = ${JSON.stringify(Object.fromEntries(Object.entries(docs).map(([k, f]) => [k, readFileSync(f, 'utf8')])), null, 2)};\n`;
writeFileSync('src/legal.gen.js', out);
console.log('src/legal.gen.js 생성');
