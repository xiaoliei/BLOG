import { useCallback, useEffect, useRef, useState } from 'react';
import LandingPage from './components/landing/LandingPage.jsx';
import WorldMap from './components/map/WorldMap.jsx';
import SceneView from './components/scenes/SceneView.jsx';
import SceneTransition from './components/SceneTransition.jsx';
import { getLandmark } from './config/world.js';

const COVER_MS = 360;
const SWAP_GAP = 40;
const UNCOVER_MS = 380;

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
  const [trans, setTrans] = useState(null); // { phase, accent, label }
  const viewRef = useRef(view);
  viewRef.current = view;

  const enterWorld = useCallback(() => {
    setView('map');
    window.location.hash = '#world';
  }, []);

  const reboot = useCallback(() => {
    setSceneId(null);
    setTrans(null);
    setView('landing');
    window.location.hash = '';
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
    setTrans({ phase: 'cover', accent: lm?.accent, label: lm?.name });
    window.setTimeout(() => {
      setSceneId(id);
      window.location.hash = `#scene/${id}`;
      setTrans({ phase: 'uncover', accent: lm?.accent, label: lm?.name });
    }, COVER_MS + SWAP_GAP);
    window.setTimeout(() => setTrans(null), COVER_MS + SWAP_GAP + UNCOVER_MS);
  }, []);

  const closeScene = useCallback(() => {
    const lm = sceneId ? getLandmark(sceneId) : null;
    setTrans({ phase: 'cover', accent: lm?.accent, label: lm?.name });
    window.setTimeout(() => {
      setSceneId(null);
      window.location.hash = '#world';
      setTrans({ phase: 'uncover', accent: lm?.accent, label: lm?.name });
    }, COVER_MS + SWAP_GAP);
    window.setTimeout(() => setTrans(null), COVER_MS + SWAP_GAP + UNCOVER_MS);
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
      <SceneTransition phase={trans?.phase} accent={trans?.accent} label={trans?.label} />
    </>
  );
}
