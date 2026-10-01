#!/usr/bin/env node
// Atelier guard — 업종·기능별 규제 판정표 (한국). 도메인 지식 없이도 "무엇을 신고하고, 무엇을 화면·약관에 넣고, 무엇을 하면 안 되는지"를 뽑는다.
//   node <atelier>/skills/guard/scripts/rules-kr.mjs [프로젝트 폴더=.]           # docs/·PROJECT.md 를 읽어 해당 항목 추정 + 물어볼 질문
//   node <atelier>/skills/guard/scripts/rules-kr.mjs . --yes pay,ugc --no kids   # 대표 답으로 확정
//   node <atelier>/skills/guard/scripts/rules-kr.mjs . --write                    # docs/rules.md 로 저장 (G7·G4 가 읽는다)
//   --json · --list (질문 목록만)
// 판정은 "확인할 것" 목록이다. 법적 판단이 아니다 — 기준·금액은 바뀌므로 링크(법제처·기관)에서 최신본을 확인한다. 확인일: 2026-10.
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LAW = (n) => `https://www.law.go.kr/법령/${n}`;

// 질문: id · 쉬운 질문 · 문서에서 추정할 낱말
export const QUESTIONS = [
  { id: 'pay', q: '이용자에게 돈을 받나요? (판매·구독·후원·유료 기능)', kw: /결제|유료|구독|가격|요금|판매|토스|과금|프리미엄|후원/ },
  { id: 'sub', q: '자동으로 매달·매년 결제되나요? (정기결제·무료 체험 후 유료)', kw: /구독|정기\s*결제|월\s*\d|자동\s*갱신|무료\s*체험/ },
  { id: 'market', q: '다른 사람끼리 사고팔거나 거래를 연결하나요? (중고거래·마켓·예약 중개)', kw: /중고|마켓|판매자|거래\s*연결|중개|입점|셀러/ },
  { id: 'ugc', q: '이용자가 글·사진·댓글을 올리거나 서로 대화하나요?', kw: /게시판|커뮤니티|댓글|후기|리뷰\s*작성|채팅|메시지|업로드|피드/ },
  { id: 'kids', q: '만 14세 미만도 쓸 수 있나요? (초등학생 대상 포함)', kw: /초등|어린이|아동|키즈|유아|만\s*14세\s*미만/ },
  { id: 'loc', q: '이용자의 현재 위치를 쓰나요? (내 주변·위치 공유·동선 기록)', kw: /위치|GPS|내\s*주변|근처|지도|동선/ },
  { id: 'health', q: '건강·병원·약·몸 상태를 다루나요?', kw: /건강|병원|의료|진료|약\b|복약|증상|다이어트|운동\s*기록|수면|생리|정신/ },
  { id: 'finance', q: '투자·대출·보험·코인을 추천하거나 연결하나요? 돈을 맡아 두나요?', kw: /투자|주식|대출|보험|코인|가상자산|송금|충전금|포인트\s*충전|예치/ },
  { id: 'edu', q: '돈을 받고 강의·수업·과외를 하나요?', kw: /강의|강좌|수업|과외|클래스|코칭|교육/ },
  { id: 'game', q: '게임인가요?', kw: /게임|플레이어|스테이지|레벨\s*업|랭킹/ },
  { id: 'lootbox', q: '돈으로 사는 뽑기·랜덤 상자가 있나요?', kw: /뽑기|가챠|랜덤\s*(박스|상자)|확률형/ },
  { id: 'ai', q: 'AI 가 글·그림·답을 만들어 주나요?', kw: /AI\s*(기능|생성|답변|요약|추천|비서|코치)|인공지능|생성형|Claude API|GPT|챗봇/ },
  { id: 'ads_msg', q: '할인·이벤트 같은 광고 메일·문자·푸시를 보내나요?', kw: /광고\s*(메일|문자|푸시)|마케팅|뉴스레터|프로모션|이벤트\s*알림/ },
  { id: 'review_ad', q: '협찬·제휴 링크·추천 수수료를 받나요?', kw: /협찬|제휴|어필리에이트|쿠팡\s*파트너스|추천\s*수수료|광고\s*수익/ },
  { id: 'food', q: '음식·건강식품을 직접 파나요?', kw: /식품|반찬|도시락|밀키트|건강\s*기능\s*식품|영양제/ },
  { id: 'travel', q: '여행 상품·숙소·투어를 팔거나 예약받나요?', kw: /여행\s*상품|숙소|숙박|투어|패키지|항공권/ },
  { id: 'job', q: '구인·구직·알바를 연결하나요?', kw: /구인|구직|채용|알바|일자리|이력서/ },
  { id: 'dating', q: '모르는 사람끼리 만남·연애·결혼을 연결하나요?', kw: /소개팅|데이팅|만남|연애|결혼\s*정보|매칭/ },
  { id: 'realty', q: '부동산 매물을 올리거나 거래를 돕나요?', kw: /부동산|매물|전세|월세|원룸|중개사/ },
  { id: 'pro', q: '법률·세무·의료 같은 전문 상담을 해 주나요?', kw: /법률\s*상담|변호사|세무\s*상담|노무|상담\s*예약/ },
  { id: 'adult', q: '성인만 볼 수 있는 내용이 있나요? (술·성인물·도박성)', kw: /성인|19세|주류|술\b|도박|베팅/ },
  { id: 'bio', q: '얼굴·지문·목소리로 사람을 알아보나요?', kw: /얼굴\s*인식|지문|생체|목소리\s*인식|안면/ },
  { id: 'donation', q: '남을 돕는 기부금을 모으나요? (내 서비스 후원은 아님)', kw: /기부|모금|후원금\s*모집|펀딩/ },
  { id: 'ride', q: '돈을 받고 사람·물건을 태워 주거나 배달을 연결하나요?', kw: /카풀|태워|배달\s*대행|운송|퀵/ },
];

// 규칙: when(질문 id 모두 예) → 무엇을 · 종류 · 언제 · 어디서 · 근거
// 종류: 신고(사람이 기관에) · 화면(서비스에 표시) · 약관 · 처리방침 · 금지(하면 안 됨 — 기능을 바꾼다) · 확인(대상인지 기관·전문가 확인)
export const RULES = [
  // 돈
  { id: 'biz', when: ['pay'], kind: '신고', at: '첫 매출 전', title: '사업자등록', do: '홈택스에서 사업자등록(업종·과세 유형은 tax-kr.md ①②).', who: '국세청 홈택스', link: 'https://www.hometax.go.kr' },
  { id: 'mailorder', when: ['pay'], kind: '신고', at: '판매 시작 전', title: '통신판매업 신고', do: '정부24 에서 신고(구매안전서비스 확인증 필요 — PG·토스페이먼츠에서 발급). 간이과세자·직전 연도 거래 횟수가 적으면 면제될 수 있으니 면제 기준 확인.', who: '시·군·구청 (정부24)', link: LAW('전자상거래등에서의소비자보호에관한법률') },
  { id: 'bizinfo', when: ['pay'], kind: '화면', at: '판매 시작 전', title: '사업자 정보 표시', do: '모든 화면 하단(또는 결제 화면)에 상호·대표자·주소·전화·이메일·사업자등록번호·통신판매업 신고번호·호스팅 제공자.', who: '', link: LAW('전자상거래등에서의소비자보호에관한법률') },
  { id: 'refund', when: ['pay'], kind: '약관', at: '판매 시작 전', title: '청약철회(환불) 규정', do: '디지털 콘텐츠는 "사용 시작 전 7일 내 환불, 사용 시작하면 제한"을 결제 전에 알리고 동의(templates/paid-terms-kr.md).', who: '', link: LAW('전자상거래등에서의소비자보호에관한법률') },
  { id: 'subnotice', when: ['sub'], kind: '화면', at: '판매 시작 전', title: '자동 갱신·무료 체험 전환 고지', do: '결제 화면에 금액·주기·다음 결제일·해지 방법. 무료 체험이 유료로 바뀌거나 값이 오르면 미리 알리고 동의받기(눈속임 설계 금지). 해지는 가입만큼 쉽게.', who: '', link: LAW('전자상거래등에서의소비자보호에관한법률') },
  // 중개
  { id: 'broker', when: ['market'], kind: '화면', at: '출시 전', title: '통신판매중개자 고지', do: '"우리는 거래 당사자가 아니라 중개자"를 상품·결제 화면과 약관에 눈에 띄게. 판매자 정보(이름·연락처 등)를 구매자에게 보여 주기.', who: '', link: LAW('전자상거래등에서의소비자보호에관한법률') },
  { id: 'c2c', when: ['market'], kind: '처리방침', at: '출시 전', title: '개인 판매자 정보 확인', do: '개인끼리 거래를 중개하면 판매자 이름·전화번호 등을 확인해 두고, 분쟁 때 상대에게 제공할 수 있음을 처리방침·약관에 적기.', who: '', link: LAW('전자상거래등에서의소비자보호에관한법률') },
  { id: 'escrow', when: ['market', 'pay'], kind: '금지', at: '설계 때', title: '거래 대금을 직접 맡지 않기', do: '판매자에게 줄 돈을 내 계좌로 받았다가 넘기면 전자금융업 등록 대상이 될 수 있다 → 토스페이먼츠 지급대행·에스크로 같은 PG 기능을 쓴다.', who: '금융위원회', link: LAW('전자금융거래법') },
  // 게시물·대화
  { id: 'ugc-report', when: ['ugc'], kind: '화면', at: '출시 전', title: '신고 버튼·처리 절차', do: '글·댓글·사용자마다 신고 버튼, 권리침해 신고 시 임시로 가리기(임시조치)와 처리 결과 알림. 운영자 화면에서 숨김 처리(build B7).', who: '', link: LAW('정보통신망이용촉진및정보보호등에관한법률') },
  { id: 'ugc-terms', when: ['ugc'], kind: '약관', at: '출시 전', title: '게시물 권리·삭제 조항', do: '게시물 저작권은 작성자, 서비스 노출에 필요한 범위의 이용 허락, 금지 게시물 목록, 운영자 삭제·이용 제한 기준.', who: '', link: LAW('정보통신망이용촉진및정보보호등에관한법률') },
  { id: 'vas', when: ['ugc'], kind: '확인', at: '규모 커지면', title: '부가통신사업 신고·불법촬영물 유통 방지', do: '자본금이 작은 소규모 사업자는 신고한 것으로 보는 경우가 많다. 매출·이용자가 커지면 신고와 불법촬영물 필터링 의무 대상인지 확인.', who: '과학기술정보통신부', link: LAW('전기통신사업법') },
  // 아동
  { id: 'kids-consent', when: ['kids'], kind: '화면', at: '출시 전', title: '만 14세 미만 법정대리인 동의', do: '가입 때 나이 확인 → 만 14세 미만이면 보호자 동의(문자·카드 인증 등) 받기. 어렵다면 "만 14세 이상만 가입"으로 막는 것이 1인 운영에 현실적.', who: '', link: LAW('개인정보보호법') },
  { id: 'kids-notice', when: ['kids'], kind: '처리방침', at: '출시 전', title: '아동용 쉬운 처리방침', do: '아이가 이해할 수 있는 말로 쓴 요약판을 따로. 아동 대상 맞춤 광고 금지.', who: '', link: LAW('개인정보보호법') },
  // 위치
  { id: 'lbs', when: ['loc'], kind: '신고', at: '출시 전', title: '위치기반서비스사업 신고', do: '이용자 개인의 위치를 써서 서비스하면 신고 대상인지 확인 후 신고. 위치정보 이용약관·별도 동의(처음 쓸 때)·이용 사실 확인 자료 보관.', who: '방송통신위원회', link: LAW('위치정보의보호및이용등에관한법률') },
  { id: 'loc-min', when: ['loc'], kind: '금지', at: '설계 때', title: '위치는 필요한 만큼만', do: '정밀 위치를 계속 저장하지 말고, 동 단위·한 번 조회로 충분하면 그렇게(개인위치정보가 아니게 만들면 의무가 크게 준다).', who: '', link: LAW('위치정보의보호및이용등에관한법률') },
  // 건강
  { id: 'sensitive', when: ['health'], kind: '처리방침', at: '출시 전', title: '건강정보 = 민감정보 별도 동의', do: '건강 상태·진료 기록은 다른 항목과 따로 동의받고, 암호화 저장, 수집 항목 최소화.', who: '', link: LAW('개인정보보호법') },
  { id: 'medical', when: ['health'], kind: '금지', at: '설계 때', title: '진단·처방처럼 말하지 않기', do: '"질환 판단·치료 권고"는 의료행위·의료기기(디지털의료제품) 문제가 될 수 있다. "기록·참고용, 진단은 의사에게" 문구, 병원 소개로 돈 받기(환자 유인) 금지.', who: '식품의약품안전처', link: LAW('의료법') },
  // 금융
  { id: 'advice', when: ['finance'], kind: '확인', at: '설계 때', title: '투자 추천 = 유사투자자문업 신고', do: '종목·매수 시점을 여러 사람에게 돈 받고 알려 주면 신고 대상, 1:1 맞춤 자문은 금지. 대출·보험 연결로 수수료를 받으면 모집인 등록 대상.', who: '금융감독원', link: LAW('자본시장과금융투자업에관한법률') },
  { id: 'stored', when: ['finance'], kind: '금지', at: '설계 때', title: '충전금·남의 돈 보관 주의', do: '현금처럼 쓰는 충전금(선불전자지급수단)·송금은 전자금융업 등록 대상일 수 있다 → 결제는 PG, 포인트는 "현금 환급 불가 서비스 포인트"로. 가상자산 매매·보관은 별도 신고.', who: '금융위원회', link: LAW('전자금융거래법') },
  // 교육
  { id: 'edu', when: ['edu', 'pay'], kind: '확인', at: '판매 시작 전', title: '원격평생교육시설·학원 신고 대상 확인', do: '돈 받고 여러 사람에게 지속적으로 온라인 강의를 열면 원격평생교육시설 신고 대상일 수 있다. 오프라인 수업·초중고 교과 과외는 학원법(교습자 신고) 확인.', who: '관할 교육청', link: LAW('평생교육법') },
  // 게임
  { id: 'rating', when: ['game'], kind: '신고', at: '출시 전', title: '게임 등급분류', do: '구글 플레이·앱스토어 같은 자체등급분류 사업자로만 유통하면 그 절차로 대체. 웹·PC 로 직접 유통하면 게임물관리위원회 등급분류.', who: '게임물관리위원회', link: LAW('게임산업진흥에관한법률') },
  { id: 'loot', when: ['lootbox'], kind: '화면', at: '출시 전', title: '확률형 아이템 확률 공개', do: '아이템 종류별 확률을 게임 안·홈페이지·광고에 표시. 표시와 실제가 다르면 제재.', who: '게임물관리위원회', link: LAW('게임산업진흥에관한법률') },
  { id: 'cashout', when: ['game', 'pay'], kind: '금지', at: '설계 때', title: '게임 재화 현금화 금지', do: '게임 머니·아이템을 현금으로 바꿔 주거나 우연으로 돈을 따게 하면 사행성 문제 → 환전·베팅 기능 넣지 않기.', who: '', link: LAW('게임산업진흥에관한법률') },
  // AI
  { id: 'ai-notice', when: ['ai'], kind: '화면', at: '출시 전', title: '생성형 AI 고지·표시', do: 'AI 가 만든 결과라는 사실을 이용자가 알게(첫 화면·결과 옆). 실제와 헷갈리는 결과물(실존 인물 얼굴·목소리)은 분명히 표시.', who: '과학기술정보통신부', link: LAW('인공지능발전과신뢰기반조성등에관한기본법') },
  { id: 'ai-transfer', when: ['ai'], kind: '처리방침', at: '출시 전', title: 'AI API 국외 이전', do: '입력을 해외 AI API 로 보내면 업체·국가·항목·보유 기간을 처리방침에.', who: '', link: LAW('개인정보보호법') },
  // 광고 메시지
  { id: 'adconsent', when: ['ads_msg'], kind: '화면', at: '보내기 전', title: '광고 수신 동의·(광고) 표시', do: '따로 동의받은 사람에게만, 제목 앞 "(광고)", 수신 거부 방법, 밤 9시~아침 8시엔 별도 동의, 2년마다 수신 동의 여부 안내(build notify 템플릿이 표시·거부 링크 처리).', who: '', link: LAW('정보통신망이용촉진및정보보호등에관한법률') },
  { id: 'disclose', when: ['review_ad'], kind: '화면', at: '출시 전', title: '협찬·제휴 표시', do: '돈·물건을 받은 추천·후기·제휴 링크에는 "광고·협찬·수수료를 받음"을 글 첫머리에 분명히.', who: '공정거래위원회', link: LAW('표시ㆍ광고의공정화에관한법률') },
  // 업종
  { id: 'food', when: ['food'], kind: '신고', at: '판매 시작 전', title: '식품 영업 신고', do: '직접 만들거나 들여와 팔면 업종(즉석판매제조가공업·식품소분판매업 등)에 맞는 영업 신고, 건강기능식품은 판매업 신고. 효능 광고는 심의·금지 표현 확인.', who: '시·군·구청 위생과', link: LAW('식품위생법') },
  { id: 'travel', when: ['travel'], kind: '확인', at: '판매 시작 전', title: '여행업 등록 대상 확인', do: '여행 상품을 직접 만들어 팔면 여행업 등록·보증보험. 숙소를 연결만 하면 통신판매중개(위 중개 항목).', who: '시·군·구청', link: LAW('관광진흥법') },
  { id: 'job', when: ['job'], kind: '신고', at: '출시 전', title: '직업정보제공사업 신고', do: '구인·구직 정보를 올리는 서비스는 신고. 직접 사람을 소개해 주고 돈을 받으면 유료직업소개사업 등록(요건 큼).', who: '고용노동부(지방고용노동관서)', link: LAW('직업안정법') },
  { id: 'dating', when: ['dating'], kind: '확인', at: '설계 때', title: '결혼중개업 해당 여부·청소년 차단', do: '결혼 목적 중개로 돈을 받으면 결혼중개업 신고. 만남 서비스는 성인 확인(본인 인증)과 신고·차단 기능 필수.', who: '시·군·구청', link: LAW('결혼중개업의관리에관한법률') },
  { id: 'realty', when: ['realty'], kind: '금지', at: '설계 때', title: '부동산 중개는 공인중개사만', do: '매물 광고는 중개사 정보·면적·가격 등 표시 의무, 허위 매물 금지. 직접 중개로 수수료 받기 금지.', who: '국토교통부', link: LAW('공인중개사법') },
  { id: 'pro', when: ['pro'], kind: '금지', at: '설계 때', title: '자격 없는 전문 상담·알선 금지', do: '변호사·세무사 등 자격 업무를 대신하거나 연결해 주고 수수료를 받으면 문제 → 정보 제공·광고형으로 설계하고 전문가 확인.', who: '', link: LAW('변호사법') },
  { id: 'adult', when: ['adult'], kind: '화면', at: '출시 전', title: '성인 인증·청소년 유해 표시', do: '본인 인증으로 19세 확인, 청소년 유해 표시. 술은 온라인 판매 자체가 거의 금지(전통주 등 예외), 도박·베팅은 기능을 빼기.', who: '여성가족부·국세청', link: LAW('청소년보호법') },
  { id: 'bio', when: ['bio'], kind: '처리방침', at: '출시 전', title: '생체정보 별도 동의', do: '얼굴·지문 같은 생체정보로 사람을 알아보면 민감정보 → 별도 동의, 원본 저장 최소화, 목적 달성 즉시 삭제.', who: '', link: LAW('개인정보보호법') },
  { id: 'donation', when: ['donation'], kind: '신고', at: '모금 전', title: '기부금품 모집 등록', do: '남을 돕는 기부금을 일정 금액 이상 모으면 모집 등록. 창작자 후원(대가 있는 판매)은 해당 없음.', who: '행정안전부·시·도', link: LAW('기부금품의모집및사용에관한법률') },
  { id: 'ride', when: ['ride'], kind: '금지', at: '설계 때', title: '유상 운송 연결 주의', do: '자가용으로 돈 받고 사람을 태우는 연결은 불법 소지가 크다. 배달은 화물·배달대행 사업 형태 확인.', who: '국토교통부', link: LAW('여객자동차운수사업법') },
];

export function detect(text) {
  return Object.fromEntries(QUESTIONS.map(({ id, kw }) => [id, kw.test(text)]));
}

// answers: { id: true|false|undefined } — undefined 는 아직 안 물어봄
export function judge(answers) {
  const yes = (id) => answers[id] === true;
  const maybe = (id) => answers[id] !== false;
  const sure = RULES.filter((r) => r.when.every(yes));
  const possible = RULES.filter((r) => !r.when.every(yes) && r.when.every(maybe));
  const ask = QUESTIONS.filter((q) => answers[q.id] === undefined && possible.some((r) => r.when.includes(q.id)));
  return { sure, possible, ask };
}

const ORDER = ['금지', '신고', '화면', '약관', '처리방침', '확인'];
export function render({ sure, ask }, { project = '' } = {}) {
  const rows = [...sure].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const out = [`# 업종·기능 규제 확인표${project ? ` — ${project}` : ''}`, '', '> 참고용 확인 목록이다(법률 판단 아님). 기준·금액은 바뀌므로 링크에서 최신본을 확인한다. 민감한 업종이면 전문가 확인.', ''];
  if (rows.length) {
    out.push('| 종류 | 할 일 | 언제 | 어떻게 | 기관 · 근거 |', '|---|---|---|---|---|');
    for (const r of rows) out.push(`| ${r.kind} | ${r.title} | ${r.at} | ${r.do} | ${r.who ? `${r.who} · ` : ''}[법령](${r.link}) |`);
  } else out.push('해당 항목 없음 (질문에 답하면 다시 판정).');
  if (ask.length) out.push('', '## 대표에게 물을 것 (예/아니요)', ...ask.map((q) => `- [ ] ${q.q} \`${q.id}\``));
  out.push('', '## 다음', '- 신고 → "사람 할 일"(G7) · 화면 → build 할 일 · 약관·처리방침 → G4 초안에 조항 추가 · 금지 → 기능을 바꾸거나 빼기 · 확인 → 기관 문의/전문가.');
  return out.join('\n') + '\n';
}

function readDocs(root) {
  const files = ['PROJECT.md', ...(existsSync(join(root, 'docs')) ? readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md') && f !== 'rules.md').map((f) => `docs/${f}`) : [])];
  return files.map((f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '')).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const root = args.find((a, i) => !a.startsWith('--') && !['--yes', '--no'].includes(args[i - 1])) ?? '.';
  const list = (flag) => { const i = args.indexOf(flag); return i >= 0 ? (args[i + 1] ?? '').split(',').filter(Boolean) : []; };
  if (args.includes('--list')) { for (const q of QUESTIONS) console.log(`${q.id}\t${q.q}`); process.exit(0); }
  const guessed = detect(readDocs(root));
  // 문서에서 찾은 낱말은 "예일 수 있음"(질문으로 확인), 못 찾은 것은 "아니요"로 추정 — --yes/--no 가 이긴다
  const answers = Object.fromEntries(QUESTIONS.map(({ id }) => [id, guessed[id] ? undefined : false]));
  for (const id of list('--yes')) answers[id] = true;
  for (const id of list('--no')) answers[id] = false;
  const unknown = [...list('--yes'), ...list('--no')].filter((id) => !QUESTIONS.some((q) => q.id === id));
  if (unknown.length) { console.error(`모르는 질문 id: ${unknown.join(', ')} (--list 로 확인)`); process.exit(2); }
  const result = judge(answers);
  if (args.includes('--json')) { console.log(JSON.stringify({ answers, sure: result.sure.map((r) => r.id), ask: result.ask.map((q) => q.id) }, null, 2)); process.exit(0); }
  const md = render(result);
  if (args.includes('--write')) { mkdirSync(join(root, 'docs'), { recursive: true }); writeFileSync(join(root, 'docs/rules.md'), md); console.log(`docs/rules.md 저장 — 확정 ${result.sure.length}개, 물을 것 ${result.ask.length}개`); }
  else process.stdout.write(md);
}
