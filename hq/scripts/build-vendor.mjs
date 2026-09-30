// vendor-src/sealed.js (tweetnacl + blakejs) → public/js/sealed.js 한 파일로 묶는다. 의존성 업데이트 후 다시 실행.
import { build } from 'esbuild';

await build({ entryPoints: ['vendor-src/sealed.js'], bundle: true, format: 'esm', minify: false, outfile: 'public/js/sealed.js', banner: { js: '// 자동 생성 (scripts/build-vendor.mjs) — tweetnacl(Unlicense) + blakejs(CC0)' }, platform: 'browser', logLevel: 'error' });
console.log('public/js/sealed.js 생성');
