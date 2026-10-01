// 설정 페이지 (MV3 는 HTML 안 인라인 스크립트를 실행하지 않으므로 파일로)
document.getElementById('clear').onclick = async () => { await chrome.storage.local.clear(); alert('지웠어요'); };
