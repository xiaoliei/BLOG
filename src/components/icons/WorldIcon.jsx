// 世界侧通用线性图标表：从 WorldApp.jsx 抽出，供世界视图各处复用。
// 未知名称回退到 home 图形，保持与拆分前完全一致的渲染兜底。
const ICON_PATHS = {
  bookshop: <><path d="M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14"/><path d="M6 9h3M15 9h3M6 12h3M15 12h3"/></>,
  workshop: <><path d="m14 4 6 6-3 3-6-6zM12 10 4 18l2 2 8-8M5 4l15 15M4 3l3 1-3 3z"/></>,
  cottage: <><path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/></>,
  station: <><rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 10h14M12 3v7M7 18l-2 3M17 18l2 3M8 14h1M15 14h1"/></>,
  observatory: <><path d="m4 8 13-5 3 7-13 5zM6 13l-2 1-2-4 2-1M13 13v3m0 0-5 6m5-6 5 6"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  home: <><path d="m3 7 9-4 9 4-9 5zM3 7v10l9 4 9-4V7M12 12v9"/></>,
  left: <path d="m14 5-7 7 7 7"/>,
  right: <path d="m10 5 7 7-7 7"/>,
  reset: <><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/></>,
};

export default function WorldIcon({ name, ...props }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{ICON_PATHS[name] || ICON_PATHS.home}</svg>;
}
