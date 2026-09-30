---
name: share
description: SNS 공유·홍보 도우미. 서비스 안에 공유 기능(공유 버튼·OG 카드·유입 경로 표시)을 넣고, 채널별 홍보 글을 써서 "한 번 눌러 올리기" 킷(Atelier HQ 홍보 화면 또는 kit.html)으로 만든다. 채널별 유입을 utm 으로 세어 다음 글에 반영한다. "SNS 에 올리고 싶어", "홍보 글 써줘", "공유 기능 넣어줘", "어디서 사람이 왔지?" 에 사용.
---

# Share — 공유·홍보

목표: 사용자가 **서비스를 퍼뜨리기 쉽게**, 운영자는 **버튼만 눌러 올리게**, 그리고 **어느 채널이 효과 있었는지** 숫자로 알게 한다.

## 원칙
- 게시는 **각 SNS 의 공식 공유 창**(intent URL)을 사람이 눌러서 한다. API 없는 커뮤니티 자동 게시·계정 자동화는 약관 위반이라 하지 않는다.
- 공식 게시 API 가 무료로 열려 있는 곳(Bluesky, Mastodon)만 대표 결재 후 자동 게시 가능. X API 는 유료 — 비용을 먼저 안내한다.
- 같은 글 도배 금지, 커뮤니티 홍보 규칙 먼저, 가짜 후기·품앗이 금지.

## 세부 단계
### S1. 공유되는 제품 만들기 (서비스 안)
- OG 카드: `og:title`·`og:description`·`og:image`(1200×630) — 카톡·SNS 미리보기. 공유될 페이지(보기 링크 등)는 개인 정보가 미리보기에 나오지 않게.
- 공유 버튼: `navigator.share`(휴대폰 공유 창 → 카톡 등), 없으면 복사. 공유 문구에 가치 한 줄 + `?ref=share`.
- 공유받은 사람 화면에 "나도 만들기" 안내 → `?ref=view`. (사용자가 사용자를 데려오는 고리)
- 첫 화면에서 `ref`·`utm_source` 를 이벤트로 기록 (`landing`, `src`).
- 참고 구현: `examples/beolgeum-jangbu` 의 `share-app`·`share-summary`·`share-view`, `/?ref=` 기록.

### S2. 채널 고르기
`docs/idea.md` 의 "첫 사용자 100명이 모인 곳"에서 3~5개. 채널 목록·한도·주의점: `scripts/channels.mjs` (`CHANNELS`).
한국 기본 조합: 대학 커뮤니티(에브리타임) · 오픈채팅 · Threads · X · 밴드/블로그. 개발자 대상이면 디스콰이엇·GeekNews·Reddit.

### S3. 채널별 글 → `docs/share/posts.json`
```json
{ "product": "…", "url": "https://…/", "campaign": "open-beta",
  "posts": [ { "channel": "threads", "when": "D-day", "text": "…" } ] }
```
- **채널마다 처음부터 다시 쓴다** — 말투·길이·금기는 `references/channel-guide.md` (에브리타임 음슴체 경험담, 오픈채팅 허락+2~4줄, Threads 1인칭 제작기, 밴드 공지체, 블로그 검색 제목+정리글 …). 첫 줄은 공감되는 불편. 링크는 자동으로 붙는다(utm 포함). 글마다 `note`(그 채널 주의점)와 `when`(올릴 곳·순서).
- 검사: `node <atelier>/skills/share/scripts/kit.mjs --check docs/share/posts.json` (글자 수 초과·빈 글).

### S4. 올리기 킷
- **Atelier HQ → 홍보** 화면: 글마다 "복사"·"○○에 올리기"(공식 공유 창)·"올렸어요"(데이터 브랜치에 기록). 베타 의견도 같은 화면에.
- HQ 를 안 쓰면: `node kit.mjs docs/share/posts.json` → `docs/share/kit.html` 을 브라우저로 열기.
- 사람이 하는 일 = 버튼 누르고 확인. 마케팅 부서는 글 준비·일정·결재 요청까지.
- 완전 자동(선택): Bluesky 는 `scripts/post-bluesky.mjs` 로 공식 API 게시(같은 글은 한 번만). 저장소 Secrets `BLUESKY_HANDLE`·`BLUESKY_APP_PASSWORD` 만 넣으면 워크플로가 올린다 (예: `.github/workflows/beolgeum-share.yml`). 키 등록 자체가 게시 승인이다.

### S5. 측정 → 다음 글
- 서비스 로그 `landing` 의 `src` 별 방문 → 가입/생성까지 이어진 비율(활성화)을 채널별로.
- 주 1회 `docs/share/results.md` 표: 채널 · 올린 날 · 방문 · 활성화 · 메모. 잘 된 채널에 다음 글을 몰아준다 (grow R5 실험과 연결).

## 산출물
서비스 공유 기능 · `docs/share/posts.json` · (선택) `kit.html` · `docs/share/results.md`
