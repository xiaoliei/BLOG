import { useCallback, useEffect, useRef, useState } from 'react';
import LandingPage from './components/landing/LandingPage.jsx';
import WorldMap from './components/map/WorldMap.jsx';
import SceneView from './components/scenes/SceneView.jsx';
import SceneTransition from './components/SceneTransition.jsx';
import { getLandmark } from './config/world.js';

const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
const initialSceneId = initialHash.startsWith('#scene/')
  ? initialHash.slice('#scene/'.length)
  : null;

export default function App() {
  const [view, setView] = useState(
    initialHash.startsWith('#world') || (initialSceneId && getLandmark(initialSceneId)) ? 'map' : 'landing'
  );
  const [sceneId, setSceneId] = useState(
    initialSceneId && getLandmark(initialSceneId) ? initialSceneId : null
  );
  const [trans, setTrans] = useState(null); // { mode: 'aggregate' | 'scatter', accent, label }
  const pendingRef = useRef(null); // { kind: 'open', id } | { kind: 'close' }
  const viewRef = useRef(view);
  viewRef.current = view;

  const enterWorld = useCallback(() => {
    setView('map');
    window.location.hash = '#world';
  }, []);

  const reboot = useCallback(() => {
    pendingRef.current = null;
    setSceneId(null);
    setTrans(null);
    setView('landing');
    window.location.hash = '';
  }, []);

  /* SCHEME C 动画播完：执行视图切换并移除遮罩 */
  const handleTransDone = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    if (pending.kind === 'open') {
      setSceneId(pending.id);
      window.location.hash = `#scene/${pending.id}`;
    } else {
      setSceneId(null);
      window.location.hash = '#world';
    }
    setTrans(null);
  }, []);

  /* 浏览器前进/后退、手动改 hash 时同步视图 */
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      if (h.startsWith('#scene/')) {
        const id = h.slice('#scene/'.length);
        if (getLandmark(id)) {
          setView('map');
          setSceneId(id);
        }
      } else if (h === '#world') {
        setView('map');
        setSceneId(null);
      } else if (h === '') {
        setView('landing');
        setSceneId(null);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openScene = useCallback((id) => {
    if (viewRef.current !== 'map') return;
    const lm = getLandmark(id);
    pendingRef.current = { kind: 'open', id };
    setTrans({ mode: 'aggregate', accent: lm?.accent, label: lm?.name });
  }, []);

  const closeScene = useCallback(() => {
    const lm = sceneId ? getLandmark(sceneId) : null;
    pendingRef.current = { kind: 'close' };
    setTrans({ mode: 'scatter', accent: lm?.accent, label: lm?.name });
  }, [sceneId]);

  return (
    <>
      {view === 'landing' ? (
        <LandingPage onComplete={enterWorld} />
      ) : (
        <div className={`map-host${sceneId ? ' hidden' : ''}`}>
          <WorldMap active={!sceneId} onEnterScene={openScene} onReboot={reboot} />
        </div>
      )}

      {sceneId && <SceneView landmark={getLandmark(sceneId)} onBack={closeScene} />}
      <SceneTransition
        mode={trans?.mode || null}
        accent={trans?.accent}
        label={trans?.label}
        onDone={handleTransDone}
      />
    </>
  );
}
