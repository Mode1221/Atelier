// 확인 대화상자만 담당 — 없어도 모든 기능이 동작한다.
document.addEventListener('submit', (e) => {
  const btn = e.submitter;
  const msg = btn && btn.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
  else if (btn) setTimeout(() => { btn.disabled = true; btn.textContent = '처리 중…'; }, 0);
});
