// 데스크톱 앱 껍데기 — 화면은 dist/ 의 웹 페이지(HTML·JS)를 그대로 쓴다. 기능은 웹처럼 만든다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // 윈도우에서 검은 콘솔 창 숨기기

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("앱을 시작하지 못했어요");
}
