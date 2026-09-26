import { lazy, Suspense } from 'react';
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const WorldApp = lazy(() => import('./world/WorldApp.jsx'));
export default function App() {
  const isAdmin = /^\/admin(?:\/|$)/.test(window.location.pathname);
  if (!isAdmin) return <Suspense fallback={<div className="admin-boot">正在准备像素世界…</div>}><WorldApp /></Suspense>;
  return <Suspense fallback={<div className="admin-boot">后台加载中…</div>}>
    <AdminApp />
  </Suspense>;
}
