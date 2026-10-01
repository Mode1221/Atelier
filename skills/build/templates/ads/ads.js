// 웹 광고 (구글 애드센스 · 카카오 애드핏) — 승인 뒤에만 켠다. public/ads.js 로 복사하고 광고 자리에 <div data-ad="sidebar"></div>.
// 원칙: 핵심 행동 화면(결제·작성·가입)에는 광고를 넣지 않는다, 광고가 늦게 와도 화면이 밀리지 않게 자리를 미리 잡는다.
export const ADS = {
  provider: 'adsense',            // 'adsense' | 'adfit' | 'off'
  client: '',                     // 애드센스 게시자 ID (ca-pub-…) — 승인 메일에 있음
  slots: { sidebar: '', inline: '' }, // 광고 단위 ID (애드센스 "광고 단위" / 애드핏 광고 단위 ID)
  excludePaths: [/^\/pay\//, /^\/login/, /^\/new/, /^\/admin/],
};

export function shouldShowAds(path, cfg = ADS) {
  if (cfg.provider === 'off' || !cfg.client && cfg.provider === 'adsense') return false;
  return !cfg.excludePaths.some((re) => re.test(path));
}

export function mountAds(doc = document, cfg = ADS) {
  if (!shouldShowAds(doc.location.pathname, cfg)) return 0;
  let n = 0;
  for (const el of doc.querySelectorAll('[data-ad]')) {
    const slot = cfg.slots[el.dataset.ad];
    if (!slot) continue;
    el.style.minHeight = el.style.minHeight || '100px'; // 자리 먼저 잡기(화면 밀림 방지)
    if (cfg.provider === 'adsense') {
      el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${cfg.client}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      (globalThis.adsbygoogle = globalThis.adsbygoogle || []).push({});
    } else if (cfg.provider === 'adfit') {
      el.innerHTML = `<ins class="kakao_ad_area" style="display:none" data-ad-unit="${slot}" data-ad-width="320" data-ad-height="100"></ins>`;
    }
    n++;
  }
  if (n) {
    const s = doc.createElement('script');
    s.async = true;
    s.src = cfg.provider === 'adsense' ? `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.client}` : 'https://t1.daumcdn.net/kas/static/ba.min.js';
    if (cfg.provider === 'adsense') s.crossOrigin = 'anonymous';
    doc.head.append(s);
  }
  return n;
}

// ads.txt 내용 (사이트 루트 /ads.txt — 애드센스 승인 뒤 필수)
export const adsTxt = (client) => (client ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` : '');
