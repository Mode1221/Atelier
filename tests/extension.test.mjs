// 확장 프로그램 템플릿(templates/extension) — manifest 점검·zip·아이콘
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { check, pack, solidPng } from '../skills/build/templates/extension/ext.mjs';

const fresh = () => { const d = mkdtempSync(join(tmpdir(), 'ext-')); cpSync(new URL('../skills/build/templates/extension/src', import.meta.url).pathname, join(d, 'src'), { recursive: true }); return d; };
const icons = (d) => { for (const s of [16, 48, 128]) writeFileSync(join(d, 'src/icons', `${s}.png`), solidPng(s)); };

test('extension: 아이콘이 없으면 알려 주고, 있으면 기본 예시가 점검을 통과한다', () => {
  const d = fresh();
  assert.match(check(join(d, 'src')).problems.join(), /아이콘 128/);
  icons(d);
  const r = check(join(d, 'src'));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.warns, []);
});

test('extension: MV2·원격 코드·인라인 스크립트·eval·넓은 권한을 잡는다', () => {
  const d = fresh(); icons(d);
  const mf = join(d, 'src/manifest.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  writeFileSync(mf, JSON.stringify({ ...m, manifest_version: 2, version: '1.0-beta', host_permissions: ['<all_urls>'] }));
  writeFileSync(join(d, 'src/popup.html'), '<script src="https://cdn.x/a.js"></script><script>alert(1)</script>');
  writeFileSync(join(d, 'src/bad.js'), 'eval("1")');
  const r = check(join(d, 'src'));
  const all = r.problems.join('\n');
  for (const re of [/manifest_version/, /version "1.0-beta"/, /원격 코드/, /인라인 스크립트/, /eval/]) assert.match(all, re);
  assert.match(r.warns.join(), /<all_urls>/);
});

test('extension: pack 은 스토어에 올릴 zip 을 만든다(내용 확인), 점검 실패면 만들지 않음', () => {
  const d = fresh(); icons(d);
  const out = pack(join(d, 'src'), join(d, 'dist'));
  const listing = execFileSync('python3', ['-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('\\n'.join(sorted(z.namelist())))`, out], { encoding: 'utf8' });
  assert.ok(listing.includes('manifest.json') && listing.includes('_locales/ko/messages.json') && listing.includes('icons/128.png'));
  const d2 = fresh();
  assert.throws(() => pack(join(d2, 'src'), join(d2, 'dist')), /아이콘/);
});
