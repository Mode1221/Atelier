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

// 리워드·경품이 걸린 글: 대가를 숨기면 뒷광고(추천·보증 심사지침 위반)가 된다.
// 글에 reward(무엇을 주는지)를 적으면 본문에 그 대가와 조건이 보여야 하고, 참여자가 후기에 붙일 표시 문구를 만들어 준다.
const REWARD_WORDS = /(추첨|증정|기프티콘|경품|리워드|쿠폰|사례금|선물|포인트 지급)/;
const CONDITION_WORDS = /(남기면|작성하면|참여하면|올리면|공유하면|가입하면|추첨|조건|선착순|대상)/;
export const disclosureLine = (reward) => `[${reward} 제공] 이 후기는 ${reward}을(를) 받고 작성했어요`;
export function check(spec) {
  const problems = [];
  for (const [i, p] of (spec.posts ?? []).entries()) {
    const ch = CHANNELS[p.channel];
    if (!ch) problems.push(`${i + 1}번 글: 모르는 채널 "${p.channel}" (가능: ${Object.keys(CHANNELS).join(', ')})`);
    else if (!p.text?.trim()) problems.push(`${i + 1}번 글(${ch.name}): 내용이 비었어요`);
    else {
      const n = postLength(p.text, p.channel);
      if (n > ch.limit) problems.push(`${i + 1}번 글(${ch.name}): ${n}자 > 한도 ${ch.limit}자`);
      if (p.reward) {
        if (!p.text.includes(p.reward)) problems.push(`${i + 1}번 글(${ch.name}): 리워드 "${p.reward}" 가 본문에 안 보여요 — 무엇을 주는지 본문에 적어요`);
        if (!CONDITION_WORDS.test(p.text)) problems.push(`${i + 1}번 글(${ch.name}): 리워드를 받는 조건(무엇을 하면, 몇 명)이 본문에 없어요`);
      } else if (REWARD_WORDS.test(p.text) && /(후기|리뷰)/.test(p.text)) {
        problems.push(`${i + 1}번 글(${ch.name}): 후기·추천에 대가가 걸린 글로 보여요 — "reward" 칸에 주는 것을 적어 대가 표시를 붙여요 (아니면 문구를 바꿔요)`);
      }
    }
  }
  return problems;
}
