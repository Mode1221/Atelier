#!/usr/bin/env node
// Atelier share — 채널별 홍보 글(posts.json)로 "한 번 눌러 올리기" 페이지(kit.html)를 만든다.
// 게시는 사람이 버튼을 눌러 한다 (각 SNS 의 공식 공유 주소 사용 — 자동 게시·약관 위반 없음).
// 링크마다 utm_source=<채널> 을 붙여 어느 채널에서 왔는지 서비스 로그로 센다.
//
// 사용: node kit.mjs [posts.json=docs/share/posts.json] [kit.html=같은 폴더/kit.html]
//       node kit.mjs --check [posts.json]   글자 수 초과·빈 글만 검사 (CI 용, 실패 시 종료 코드 1)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CHANNELS, withUtm, length, postLength, check } from './channels.mjs';
export { CHANNELS, withUtm, length, postLength, check };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function render(spec) {
  const items = spec.posts.map((p, i) => {
    const ch = CHANNELS[p.channel];
    const url = withUtm(p.url ?? spec.url, p.channel, spec.campaign);
    const full = ch.linkInComment ? p.text : `${p.text}\n${url}`;
    const comment = ch.linkInComment ? `<p class="meta">첫 댓글에 넣을 링크: <code id="l${i}">${esc(url)}</code></p>` : '';
    const open = ch.intent ? `<a class="btn primary" href="${esc(ch.intent(p.text, url))}" target="_blank" rel="noopener">${esc(ch.name)}에 올리기</a>` : '';
    return `<article class="card"><h2>${i + 1}. ${esc(ch.name)}${p.when ? ` <small>${esc(p.when)}</small>` : ''}</h2>
<pre id="t${i}">${esc(full)}</pre>
${comment}<p class="meta">${postLength(p.text, p.channel)} / ${ch.limit}자${(p.note ?? ch.note) ? ` · ${esc(p.note ?? ch.note)}` : ''}</p>
<div class="row"><button type="button" data-copy="t${i}">글 복사</button>${ch.linkInComment ? `<button type="button" data-copy="l${i}">링크 복사</button>` : ''}${open}<label><input type="checkbox" data-done="${i}"> 올렸어요</label></div></article>`;
  });
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>홍보 킷 — ${esc(spec.product ?? '')}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
:root{--bg:#fff;--fg:#111;--mut:#555;--card:#f4f5f7;--line:#ccd;--pri:#1d4ed8;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#aaa;--card:#1c1d21;--line:#445;--pri:#7aa2ff;--on:#111}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
h2{font-size:18px;margin:0 0 8px}small{color:var(--mut);font-weight:400}
pre{white-space:pre-wrap;word-break:break-all;font:inherit;margin:0 0 8px}
.meta{color:var(--mut);font-size:14px;margin:0 0 8px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button,.btn{min-height:44px;padding:0 16px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.btn.primary{background:var(--pri);border-color:var(--pri);color:var(--on)}
label{display:inline-flex;gap:6px;align-items:center;min-height:44px}
</style></head><body><main>
<h1>홍보 킷 — ${esc(spec.product ?? '')}</h1>
<p>버튼을 누르면 각 SNS 글쓰기 창이 열려요. 내용 확인 후 직접 올리세요. 링크에는 채널 표시(utm)가 붙어 있어 어디서 사람이 왔는지 셀 수 있어요.</p>
<p><small>원칙: 같은 글 여러 곳 도배 금지 · 커뮤니티 규칙 먼저 · 가짜 후기·품앗이 금지</small></p>
${items.join('\n')}
</main>
<script>
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){
  var t=document.getElementById(b.dataset.copy).textContent;
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent='복사했어요'},function(){b.textContent='복사 실패 — 직접 선택하세요'});
});});
document.querySelectorAll('[data-done]').forEach(function(c){var k='kit-done-'+c.dataset.done;
  try{c.checked=localStorage.getItem(k)==='1'}catch(e){}
  c.addEventListener('change',function(){try{localStorage.setItem(k,c.checked?'1':'0')}catch(e){}});});
</script></body></html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const onlyCheck = args[0] === '--check';
  if (onlyCheck) args.shift();
  const src = args[0] ?? 'docs/share/posts.json';
  const spec = JSON.parse(readFileSync(src, 'utf8'));
  const problems = check(spec);
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) process.exit(1);
  if (!onlyCheck) {
    const out = args[1] ?? join(dirname(src), 'kit.html');
    writeFileSync(out, render(spec));
    console.log(`홍보 킷: ${out} (글 ${spec.posts.length}개)`);
  } else console.log(`글 ${spec.posts.length}개 이상 없음`);
}
