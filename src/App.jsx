import { lazy, Suspense } from 'react';
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
export default function App() {
  const isAdmin = /^\/admin(?:\/|$)/.test(window.location.pathname);
  if (!isAdmin) return null;
  return <Suspense fallback={<div className="admin-boot">后台加载中…</div>}>
    <AdminApp />
  </Suspense>;
}
