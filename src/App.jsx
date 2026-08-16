import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import RoomHome from './components/home/RoomHome.jsx';
import LandingPage from './components/landing/LandingPage.jsx';

/* /admin 路径前缀：独立懒加载 chunk（读者不下载编辑器代码） */
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

const initialHash = typeof window !== 'undefined' ? window.location.hash : '';

/* 三阶段：landing（启动页）→ revealing（地球放大旋转到交接点，聚焦飞行从指定起点起飞）→ home
   房间从页面加载即常驻挂载：预渲染并停在过渡入场位，交接零等待
   hash '#home' 可跳过启动页直达首页 */
export default function App() {
  /* pathname 级路由：/admin/* 整页切换到后台（SPA 回退由 assets 配置保证刷新可用） */
  const isAdmin = useMemo(
    () => typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '').startsWith('/admin'),
    [],
  );

  if (isAdmin) {
    return (
      <Suspense fallback={<div className="admin-boot">后台加载中…</div>}>
        <AdminApp />
      </Suspense>
    );
  }
  return <BlogApp />;
}

function BlogApp() {
  const [phase, setPhase] = useState(initialHash === '#home' ? 'home' : 'landing');

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  /* 地球放大到交接点：启动层开始淡出，房间聚焦飞行从指定起点起飞 */
  const handleZoomHalf = useCallback(() => {
    if (reducedMotion) {
      window.location.hash = '#home';
      setPhase('home');
    } else {
      setPhase('revealing');
    }
  }, [reducedMotion]);

  /* reveal 淡出完成：卸载启动层，只保留博客首页 */
  const handleRevealDone = useCallback(() => {
    window.location.hash = '#home';
    setPhase('home');
  }, []);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      if (h === '#home') setPhase('home');
      else if (h === '') setPhase('landing');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <RoomHome
        autoFocus={!reducedMotion && phase !== 'home'}
        beginFocus={phase === 'revealing'}
      />
      {phase !== 'home' && (
        <LandingPage
          revealing={phase === 'revealing'}
          onZoomHalf={handleZoomHalf}
          onRevealDone={handleRevealDone}
        />
      )}
    </>
  );
}
