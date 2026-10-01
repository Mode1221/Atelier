// 팝업: 지금 탭 정보를 보여 주고 저장한다 (activeTab 권한 — 사용자가 아이콘을 누른 탭만 볼 수 있다)
const $ = (id) => document.getElementById(id);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
$('title').textContent = tab?.title ?? '';
const show = async () => { const { saved = [] } = await chrome.storage.local.get('saved'); $('count').textContent = `저장한 페이지 ${saved.length}개`; };
$('save').onclick = async () => {
  const { saved = [] } = await chrome.storage.local.get('saved');
  if (!saved.some((s) => s.url === tab.url)) saved.push({ url: tab.url, title: tab.title, at: Date.now() });
  await chrome.storage.local.set({ saved });
  await chrome.runtime.sendMessage({ type: 'saved', count: saved.length });
  show();
};
show();
