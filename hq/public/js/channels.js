// Atelier share — SNS 채널 목록과 공유 주소 (브라우저·Node 공용, 의존성 없음).
// Atelier HQ 가 public/js/channels.js 로 복사해 쓴다 (hq: npm run sync-template).
const enc = encodeURIComponent;
// limit: 글자 수 한도 (X 는 한글을 2자로 센다 → weight 2). intent: 공식 공유 주소 (없으면 복사 후 직접 붙여넣기)
// linkInComment: 본문에 링크를 넣지 않고 올린 뒤 첫 댓글에 붙인다 (본문 링크는 노출이 줄어드는 채널)
export const CHANNELS = {
  x: { name: 'X (트위터)', limit: 280, weight: 2, intent: (t, u) => `https://x.com/intent/post?text=${enc(t)}&url=${enc(u)}` },
  threads: { name: 'Threads', limit: 500, linkInComment: true, intent: (t) => `https://www.threads.net/intent/post?text=${enc(t)}` },
  bluesky: { name: 'Bluesky', limit: 300, intent: (t, u) => `https://bsky.app/intent/compose?text=${enc(`${t}\n${u}`)}` },
  facebook: { name: 'Facebook', limit: 5000, intent: (_t, u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}`, note: '글은 자동으로 안 채워져요 — 먼저 "글 복사" 후 붙여넣기' },
  linkedin: { name: 'LinkedIn', limit: 3000, intent: (_t, u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}`, note: '글은 복사해서 붙여넣기' },
  reddit: { name: 'Reddit', limit: 300, intent: (t, u) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(t.split('\n')[0])}`, note: '서브레딧 규칙(자기 홍보 허용 여부) 먼저 확인' },
  band: { name: '네이버 밴드', limit: 2000, intent: (t, u) => `https://band.us/plugin/share?body=${enc(`${t}\n${u}`)}&route=${enc(u)}` },
  naver_blog: { name: '네이버 블로그', limit: 5000, intent: (t, u) => `https://share.naver.com/web/shareView?url=${enc(u)}&title=${enc(t.split('\n')[0])}` },
  kakaotalk: { name: '카카오톡 (단톡·오픈채팅)', limit: 1000, note: '복사 → 방에 붙여넣기. 오픈채팅은 방 규칙 확인' },
  everytime: { name: '에브리타임', limit: 2000, note: '복사 → 게시판에 붙여넣기. 홍보 게시판에만' },
  discord: { name: 'Discord', limit: 2000, note: '복사 → 홍보 허용 채널에 붙여넣기' },
  instagram: { name: 'Instagram', limit: 2200, note: '링크는 프로필 링크에. 이미지와 함께 올리기' },
  naver_cafe: { name: '네이버 카페', limit: 5000, note: '복사 → 카페 홍보 게시판에. 카페 규칙 양식 확인' },
  daangn: { name: '당근 동네생활', limit: 2000, note: '복사 → 동네생활에. 노골적 광고는 신고돼요' },
  disquiet: { name: '디스콰이엇', limit: 5000, note: '복사 → 메이커 로그에. 제작기 형식' },
};

export function withUtm(url, source, campaign) {
  const u = new URL(url);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', 'social');
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  return u.href;
}
export function length(text, ch) {
  const w = CHANNELS[ch]?.weight ?? 1;
  let n = 0;
  for (const c of text) n += w > 1 && c.codePointAt(0) > 0x10ff ? w : 1;
  return n;
}

// 링크가 본문에 같이 들어가는 채널은 링크 길이(대략 23자)까지 센다
export const postLength = (text, ch) => length(text, ch) + (CHANNELS[ch]?.linkInComment ? 0 : 24);

export function check(spec) {
  const problems = [];
  for (const [i, p] of (spec.posts ?? []).entries()) {
    const ch = CHANNELS[p.channel];
    if (!ch) problems.push(`${i + 1}번 글: 모르는 채널 "${p.channel}" (가능: ${Object.keys(CHANNELS).join(', ')})`);
    else if (!p.text?.trim()) problems.push(`${i + 1}번 글(${ch.name}): 내용이 비었어요`);
    else {
      const n = postLength(p.text, p.channel);
      if (n > ch.limit) problems.push(`${i + 1}번 글(${ch.name}): ${n}자 > 한도 ${ch.limit}자`);
    }
  }
  return problems;
}
