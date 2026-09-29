# 디자인 토큰 구조

토큰 = 디자인 결정을 이름 붙인 변수. 코드는 원시값(#hex, px)이 아니라 토큰만 쓴다.

## 2단 구조
1. **원시 토큰**: 팔레트 그 자체. `--blue-500: #2563eb;`
2. **의미 토큰**: 용도. `--color-primary: var(--blue-500);`
화면 코드는 의미 토큰만 참조한다. 다크 모드는 의미 토큰만 다시 매핑한다.

## 최소 세트
```css
:root {
  /* 색 */
  --color-bg: #ffffff;
  --color-surface: #f6f7f9;
  --color-text: #111827;
  --color-text-muted: #4b5563;
  --color-border: #e5e7eb;
  --color-primary: #2563eb;
  --color-on-primary: #ffffff;
  --color-danger: #dc2626;
  --color-success: #15803d;

  /* 타이포 (1.25 배 스케일 예) */
  --font-sans: system-ui, -apple-system, "Pretendard", sans-serif;
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-md: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.563rem; --text-2xl: 1.953rem;
  --leading-body: 1.6; --leading-tight: 1.25;

  /* 간격 (4px 단위) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;

  /* 모양 */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / .06);
  --shadow-md: 0 4px 12px rgb(0 0 0 / .08);

  /* 모션 */
  --duration-fast: 120ms; --duration-base: 200ms;
  --ease-out: cubic-bezier(.2, .8, .2, 1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0b0d10;
    --color-surface: #16191e;
    --color-text: #f3f4f6;
    --color-text-muted: #a1a1aa;
    --color-border: #2a2e35;
    --color-primary: #60a5fa;
    --color-on-primary: #0b0d10;
    --color-danger: #f87171;
    --color-success: #4ade80;
  }
}
@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; }
}
```
예시 값은 출발점이다. 바꾼 뒤에는 반드시 대비를 다시 계산한다.

## 스택별 저장 위치
| 스택 | 형태 |
|---|---|
| 웹 (CSS/Tailwind) | CSS 변수 → Tailwind `theme.extend` 에서 변수 참조 |
| React Native / Expo | `theme.ts` 객체 |
| Flutter | `ThemeData` + `ColorScheme` |
| Unity / Godot | 스타일 리소스(Theme) + 색상 상수 스크립트 |
