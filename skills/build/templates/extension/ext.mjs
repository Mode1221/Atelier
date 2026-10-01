#!/usr/bin/env node
// 브라우저 확장 프로그램 도구 — 의존성 없음.
//   node scripts/ext.mjs check   : manifest 점검(MV3·권한 최소·아이콘·버전·설명 길이·원격 코드 금지)
//   node scripts/ext.mjs pack    : src/ 를 dist/<이름>-<버전>.zip 으로 (크롬 웹 스토어·엣지 애드온에 그대로 업로드)
//   node scripts/ext.mjs icons   : 아이콘이 없으면 단색 PNG 16·48·128 을 만든다(나중에 design D7 아이콘으로 교체)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateSync, deflateRawSync, crc32 } from 'node:zlib';

const RISKY = ['<all_urls>', 'tabs', 'history', 'cookies', 'webRequest', 'debugger', 'management', 'downloads', 'clipboardRead', 'nativeMessaging', 'scripting'];
export function check(dir = 'src') {
  const problems = [], warns = [];
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  if (m.manifest_version !== 3) problems.push('manifest_version 은 3 이어야 해요(2 는 크롬 웹 스토어가 받지 않음)');
  if (!/^\d+(\.\d+){0,3}$/.test(m.version ?? '')) problems.push(`version "${m.version}" — 숫자와 점만(예: 1.0.2)`);
  const msg = (v) => { const k = /^__MSG_(\w+)__$/.exec(v ?? '')?.[1]; if (!k) return v; try { return JSON.parse(readFileSync(join(dir, '_locales', m.default_locale ?? 'en', 'messages.json'), 'utf8'))[k]?.message; } catch { return undefined; } };
  if (!msg(m.name)) problems.push('name 이 비었어요');
  if ((msg(m.description) ?? '').length > 132) problems.push('description 은 132자 이하');
  for (const [size, p] of Object.entries(m.icons ?? {})) if (!existsSync(join(dir, p))) problems.push(`아이콘 ${size} 파일이 없어요: ${p} — node scripts/ext.mjs icons`);
  if (!m.icons?.['128']) problems.push('128px 아이콘이 필요해요(스토어 필수)');
  for (const p of [...(m.permissions ?? []), ...(m.host_permissions ?? [])]) if (RISKY.includes(p) || /^\*:\/\/\*\//.test(p)) warns.push(`"${p}" 권한은 심사가 길어지고 사용자에게 경고가 떠요 — 꼭 필요한지, activeTab 이나 특정 사이트로 줄일 수 있는지`);
  const files = list(dir).filter((f) => /\.(js|html)$/.test(f));
  for (const f of files) {
    const t = readFileSync(join(dir, f), 'utf8');
    if (/<script[^>]+src=["']https?:/i.test(t) || /import\s*\(\s*['"]https?:/.test(t)) problems.push(`${f}: 원격 코드를 불러와요 — MV3 는 금지(파일로 넣기)`);
    if (/\beval\s*\(|new Function\s*\(/.test(t)) problems.push(`${f}: eval/new Function 은 MV3 에서 막혀요`);
    if (f.endsWith('.html') && /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(t)) problems.push(`${f}: HTML 안의 인라인 스크립트는 MV3 에서 실행되지 않아요 — .js 파일로 빼기`);
  }
  return { ok: problems.length === 0, problems, warns, manifest: m };
}
function list(dir) {
  const out = [];
  (function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).split('\\').join('/')); } })(dir);
  return out.sort();
}
// 최소 ZIP 쓰기 (deflate) — 외부 프로그램 없이 윈도우·맥 모두
export function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameB = Buffer.from(name), raw = Buffer.from(data), comp = deflateRawSync(raw), crc = crc32(raw); // ZIP 은 머리 없는 deflate
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
export function pack(dir = 'src', outDir = 'dist') {
  const r = check(dir);
  if (!r.ok) throw new Error(r.problems.join('\n'));
  const files = list(dir).filter((f) => !/(^|\/)\.|\.map$/.test(f));
  const name = String(r.manifest.name).startsWith('__MSG_') ? 'extension' : r.manifest.name.replace(/[^\w-]+/g, '-');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${name}-${r.manifest.version}.zip`);
  writeFileSync(out, zip(files.map((f) => ({ name: f, data: readFileSync(join(dir, f)) }))));
  return out;
}
// 단색 PNG (아이콘 자리) — 나중에 진짜 아이콘으로 바꾼다
export function solidPng(size, [r, g, b] = [59, 91, 219]) {
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) row.set([r, g, b, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const [cmd = 'check', dir = 'src'] = process.argv.slice(2);
  if (cmd === 'icons') {
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    for (const [s, p] of Object.entries(m.icons ?? {})) if (!existsSync(join(dir, p))) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), solidPng(Number(s))); console.log(`+ ${p}`); }
  } else if (cmd === 'pack') {
    try { console.log(`✓ ${pack(dir)} — 크롬 웹 스토어 개발자 대시보드 → 새 항목 → 이 zip 업로드`); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  } else {
    const r = check(dir);
    for (const p of r.problems) console.log(`✗ ${p}`);
    for (const w of r.warns) console.log(`⚠ ${w}`);
    console.log(r.ok ? '✓ manifest 점검 통과' : '');
    process.exit(r.ok ? 0 : 1);
  }
}
