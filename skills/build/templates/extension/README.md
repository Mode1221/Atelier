# 브라우저 확장 프로그램 (크롬·엣지·웨일, Manifest V3)

`src/` 를 프로젝트에 복사하면 바로 동작하는 예시(지금 페이지 저장 + 배지 + 설정)가 된다. 서버가 필요하면 웹 스택(Workers)을 따로 두고 `fetch` 로 부른다(host_permissions 에 그 주소 하나만).

## 만들기·시험
1. `node scripts/ext.mjs icons` (임시 아이콘) → `node scripts/ext.mjs check`
2. 크롬 주소창 `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `src` 폴더 (사람이 한 번 눌러 확인)
3. 자동 시험: Playwright 로 `--load-extension=src` 크로미움을 띄워 팝업 페이지(`chrome-extension://<id>/popup.html`)를 연다
4. `node scripts/ext.mjs pack` → `dist/*.zip`

## 스토어 (사람 할 일)
- 크롬 웹 스토어 개발자 등록(1회 $5) → 새 항목 → zip 업로드 → 스토어 등록정보(설명·스크린샷 1280×800 1장 이상·아이콘 128)
- **개인정보 관행** 탭: 어떤 데이터를 모으는지(이 예시는 "수집 안 함"), 단일 목적 설명, 권한마다 사용 이유 — 권한이 넓을수록 심사가 길다
- 엣지 애드온(무료)·네이버 웨일 스토어도 같은 zip
- 업데이트: manifest `version` 을 올리고 다시 pack → 업로드 (심사 후 자동 업데이트)
