# 데스크톱 앱 (윈도우·맥·리눅스, Tauri 2)

화면은 웹(HTML·JS)으로 만들고 Tauri 가 작은 설치 파일(수 MB)로 감싼다. 서버가 필요하면 웹 스택(Workers)을 따로 두고 `fetch`.

## 만드는 흐름 (사람은 내려받아 실행만)
1. 이 폴더를 프로젝트에 복사: `dist/`(화면), `src-tauri/`(껍데기), `.github/workflows/desktop.yml`
2. `src-tauri/tauri.conf.json` 의 `productName`·`identifier`(예: `kr.<내이름>.<앱>`, 한 번 정하면 바꾸지 않음)·창 크기
3. 아이콘: 1024×1024 PNG 를 `src-tauri/icons/icon.png` 로 (design D7). 여러 크기는 CI 에서 `npx @tauri-apps/cli icon` 이 만든다
4. 화면 시험은 브라우저로 `dist/index.html` 을 열어서(웹과 같음). 데스크톱 창 시험은 CI 결과물로.
5. `git tag v0.1.0 && git push --tags` → GitHub Actions 가 세 운영체제 설치 파일을 Releases 초안에 올린다 → 확인 후 "공개"

## 사람 할 일·비용
- GitHub 가입(무료) — 빌드와 배포 장소
- **코드 서명(선택)**: 없으면 윈도우 "PC 보호" 경고·맥 "확인되지 않은 개발자"가 뜬다. 맥은 Apple Developer(연 $99) + 공증, 윈도우는 코드 서명 인증서(연 수십만 원, 공급사마다 다름). 처음엔 서명 없이 "설치 방법" 안내 페이지로 시작해도 된다.
- 자동 업데이트: `tauri-plugin-updater` + 서명 키(무료) — 사용자가 생기면 붙인다(나중).
