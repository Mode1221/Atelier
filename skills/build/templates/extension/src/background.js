// 백그라운드(서비스 워커): 잠들었다 깨어나므로 변수에 상태를 두지 말고 chrome.storage 에 둔다
chrome.runtime.onInstalled.addListener(() => chrome.action.setBadgeBackgroundColor({ color: '#3b5bdb' }));
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'saved') chrome.action.setBadgeText({ text: String(msg.count) });
});
