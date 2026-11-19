import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createWorldEngine } from './engine.ts';
import type { Phase, Stats, WorldEngineHandle } from './engine.ts';
import { PLACES, PLACE_MAP, readWorldRoute } from './places.ts';
import type { Route } from './places.ts';
import { entryVisuals } from './entry-flight.ts';
import type { EntryVisuals } from './entry-flight.ts';
import { getSettings, getStaticSettings } from '../lib/api.ts';
import type { SiteSettingsWithMeta } from '../types/api.ts';
import { useSystemClock } from '../hooks/useSystemClock.ts';
import type { SystemClock } from '../hooks/useSystemClock.ts';
import { localDateAtMinutes, localWorldTime } from '../lib/local-time.ts';
import WorldIcon from '../components/icons/WorldIcon.tsx';
import PlacePanel from './PlacePanel.tsx';
import LandingView from './LandingView.tsx';
import type { CustomCSS } from './WorldAppTypes.ts';
import './world.css';

const ArticleReader = lazy(() => import('./ArticleReader.tsx'));


interface ArticleHistoryState {
  articleSlug?: string;
  articleOrigin?: string | null;
  articleDepth?: number;
  articlePlace?: string | null;
}

export default function WorldApp(){
  const initialRoute=useRef<Route>(readWorldRoute(location.hash));
  const [route,setRoute]=useState<Route>(initialRoute.current);
  const [phase,setPhase]=useState<Phase>(initialRoute.current.home?'world':'loading');
  const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[fallback,setFallback]=useState(false),[skipEarth,setSkipEarth]=useState(false);
  const [labels,setLabels]=useState<{id:string;x:number;y:number;visible:boolean}[]>([]),[stats,setStats]=useState<Stats|null>(null);
  const [rotateBounds,setRotateBounds]=useState('lr');
  const canvas=useRef<HTMLCanvasElement|null>(null),engine=useRef<WorldEngineHandle|null>(null),nav=useRef<HTMLElement|null>(null),root=useRef<HTMLElement|null>(null),keyboardEntry=useRef(false);
  const lastEntryVisuals=useRef<Partial<Record<string, number>>>({}),directEntry=useRef(false);
  const placeScroll=useRef(new Map<string, number>()),returnPostSlug=useRef<string|null>(null),routeRef=useRef<Route>(initialRoute.current),articlePlaceRef=useRef<string|null>(null);
  const [focusPostSlug,setFocusPostSlug]=useState<string|null>(null);
  const [settings,setSettings]=useState<SiteSettingsWithMeta>(getStaticSettings);
  const islandNameRef=useRef(settings.islandName);
  islandNameRef.current=settings.islandName;
  const debug=new URLSearchParams(location.search).has('worldDebug');
  const entryPreview=import.meta.env.DEV&&debug&&new URLSearchParams(location.search).has('entryFrame');
  const liveClock=useSystemClock(),previewClock=useRef<SystemClock>(liveClock);
  const clock=entryPreview?previewClock.current:liveClock;
  const timeDebugEnabled=import.meta.env.DEV&&new URLSearchParams(location.search).get('debug')==='true';
  const [debugMinutes,setDebugMinutes]=useState<number|null>(null);
  const actualMinutes=Number(clock.time.slice(0,2))*60+Number(clock.time.slice(3,5));
  const shownMinutes=debugMinutes??actualMinutes;
  const shownTime=`${String(Math.floor(shownMinutes/60)).padStart(2,'0')}:${String(shownMinutes%60).padStart(2,'0')}`;
  const shownWorldTime=localWorldTime(localDateAtMinutes(shownMinutes));
  const sceneVisible=phase==='world'||phase==='focused'||phase==='leaving';
  const entering=phase==='entering';
  const selected=route.place?PLACE_MAP[route.place]:undefined;
  const inspection=import.meta.env.DEV&&debug&&new URLSearchParams(location.search).has('view');
  function visit(id: string|null): void{location.hash=id?`home/${id}`:'home';}
  function close(): void{visit(null);requestAnimationFrame(()=>nav.current?.querySelector<HTMLElement>(`[data-place="${route.place}"]`)?.focus());}
  function goHome(): void{location.hash='home';requestAnimationFrame(()=>nav.current?.querySelector<HTMLElement>('button')?.focus({preventScroll:true}));}
  function openPost(slug: string,placeId: string): void{
    returnPostSlug.current=slug;
    setFocusPostSlug(null);
    location.hash=`post/${slug}`;
    history.replaceState({...((history.state||{}) as ArticleHistoryState),articleSlug:slug,articleOrigin:placeId,articleDepth:1},'');
  }
  function navigatePost(slug: string,placeId: string|null): void{
    const current=(history.state||{}) as ArticleHistoryState;
    location.hash=`post/${slug}`;
    history.replaceState({...((history.state||{}) as ArticleHistoryState),articleSlug:slug,articleOrigin:current.articleOrigin||null,articleDepth:current.articleOrigin?(current.articleDepth||1)+1:0,articlePlace:placeId},'');
  }
  function returnFromPost(placeId: string|null): void{
    const state=(history.state||{}) as ArticleHistoryState;
    if(state.articleSlug===routeRef.current.post&&state.articleOrigin&&state.articleDepth){
      setFocusPostSlug(returnPostSlug.current);
      history.go(-state.articleDepth);
    }else{
      returnPostSlug.current=null;
      location.replace(`#home/${placeId||articlePlaceRef.current||state.articlePlace||''}`.replace(/\/$/,''));
    }
  }
  const resolvedArticlePlace=useCallback((id: string|null)=>{articlePlaceRef.current=id;if(id)engine.current?.navigate({home:true,place:id});},[]);
  const focusRestored=useCallback(()=>{returnPostSlug.current=null;setFocusPostSlug(null);},[]);
  const updateEntryVisuals=useCallback((visuals: EntryVisuals)=>{
    const node=root.current;if(!node)return;
    for(const [name,value] of Object.entries(visuals))if(name!=='seconds'&&lastEntryVisuals.current[name]!==value){
      node.style.setProperty(`--entry-${name}`,String(value));lastEntryVisuals.current[name]=value;
    }
  },[]);
  useEffect(()=>{
    let alive=true;
    getSettings().then(data=>{if(alive&&data)setSettings(data);}).catch(()=>{});
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{
    let active=true;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    try{
      engine.current=createWorldEngine(canvas.current as HTMLCanvasElement,{
        initialRoute:initialRoute.current,reducedMotion:motion.matches,
        islandNameRef,
        onReady:()=>{if(active)setReady(true);},
        onEntryProgress:visuals=>{if(active)updateEntryVisuals(visuals);},
        onRotateBounds:({canRotateLeft,canRotateRight})=>{if(active)setRotateBounds(`${canRotateLeft?'l':''}${canRotateRight?'r':''}`);},
        onPhase:next=>{
          if(!active)return;setPhase(next);
          if(next==='world'&&!readWorldRoute(location.hash).home){
            location.hash='home';
            if(keyboardEntry.current)requestAnimationFrame(()=>nav.current?.querySelector<HTMLElement>('button')?.focus({preventScroll:true}));
            keyboardEntry.current=false;
          }
        },
        onSelect:id=>visit(id),onLabels:l=>{if(active)setLabels(l);},onStats:s=>{if(active)setStats(s);},
        onError:(message,earthOnly)=>{if(active){setError(message);directEntry.current=true;if(earthOnly)setSkipEarth(true);else{
          updateEntryVisuals({...entryVisuals(0),ui:1,header:1,labels:1,navigation:1});
          setFallback(true);engine.current?.dispose();engine.current=null;setPhase(readWorldRoute(location.hash).home?'world':'idle');
        }setReady(true);}},
      });
    }catch{setFallback(true);setReady(true);setError('当前设备无法显示三维画面，已切换为静态预览。地点目录仍可使用。');setPhase(initialRoute.current.home?'world':'idle');}
    const hash=()=>{const next=readWorldRoute(location.hash);routeRef.current=next;if(next.post)articlePlaceRef.current=(history.state as ArticleHistoryState|null)?.articlePlace||(history.state as ArticleHistoryState|null)?.articleOrigin||null;setRoute(next);engine.current?.navigate(next);if(!engine.current)setPhase(next.home?'world':'idle');};
    const key=(e: KeyboardEvent)=>{
      if(e.key==='Escape'&&routeRef.current.post){e.preventDefault();returnFromPost(articlePlaceRef.current);return;}
      if(e.key==='Escape'&&readWorldRoute(location.hash).place){visit(null);nav.current?.querySelector<HTMLElement>('button')?.focus();}
      if((e.key==='Enter'||e.key===' ')&&!readWorldRoute(location.hash).home&&e.target===document.body){e.preventDefault();keyboardEntry.current=true;if(engine.current&&!directEntry.current)engine.current.enter();else visit(null);}
    };
    const reduce=()=>engine.current?.setReducedMotion(motion.matches);
    window.addEventListener('hashchange',hash);window.addEventListener('keydown',key);motion.addEventListener('change',reduce);
    return()=>{active=false;engine.current?.dispose();engine.current=null;window.removeEventListener('hashchange',hash);window.removeEventListener('keydown',key);motion.removeEventListener('change',reduce);};
  },[]);
  useEffect(()=>{if(timeDebugEnabled)engine.current?.setTimeOverride(debugMinutes);},[timeDebugEnabled,debugMinutes]);
  /* 阅读页覆盖整个世界：暂停 3D 渲染，关闭后再恢复。ready 依赖保证
     直接打开 #post/… 时，引擎创建完成后也会落到暂停态。 */
  useEffect(()=>{engine.current?.setPaused(!!route.post);},[route.post,ready]);
  function enter(event?: { detail?: number } | MouseEvent){keyboardEntry.current=(event as CustomEvent | undefined)?.detail===0;if(fallback||skipEarth){visit(null);return;}engine.current?.enter();}
  const chromeStyle: CustomCSS={'--world-scene-text':shownWorldTime.ink};
  return <main ref={root} className={`world-app ${sceneVisible?'is-world':'is-landing'} ${selected?'has-place':''} ${route.post?'has-article':''} ${inspection?'is-inspecting':''} ${timeDebugEnabled?'has-time-debug':''}`} data-phase={phase} data-entry-preview={entryPreview||undefined} data-time-phase={shownWorldTime.phase} style={chromeStyle}>
    {fallback&&sceneVisible&&<img className="world-fallback" src={`${import.meta.env.BASE_URL}world/harbor-preview.png`} alt={`卡通${settings.islandName}概念预览：书店、工坊、车站与天文台沿海岸展开`}/>}
    <canvas ref={canvas} className="world-canvas" aria-label={`${settings.islandName}三维场景，可使用地点目录探索`} aria-hidden={route.post?'true':undefined} inert={!!route.post} style={{visibility:fallback?'hidden':'visible'}}/>
    <LandingView active={!sceneVisible} leaving={phase==='leaving'} entering={entering} entryPreview={entryPreview} clock={clock} ready={ready} skipEarth={skipEarth} fallback={fallback} islandName={settings.islandName} covered={!!route.post} onEnter={enter}/>
    {(sceneVisible||entering)&&<div className="world-chrome" inert={!!route.post||entering} aria-hidden={route.post||entering?'true':undefined}>
      <header className="world-header"><a href="#home" onClick={()=>{if(!selected)engine.current?.reset();}} className="world-brand" aria-label={`${settings.name}，回到全景`}><WorldIcon name="home" width="30" height="30"/><span><strong>{settings.name}</strong><small>{settings.islandTagline}</small></span></a><div className="world-local-time" aria-label={`${debugMinutes===null?'设备当地时间':'模拟当地时间'} ${clock.date} ${shownTime}`}><time>{shownTime}</time><span>{debugMinutes===null?'当地时间':'模拟时间'}</span></div><button className="world-return" aria-label="返回星球" onClick={()=>{location.hash='';}}><WorldIcon name="reset" width="16" height="16"/><span>返回星球</span></button></header>
      {timeDebugEnabled&&!inspection&&!fallback&&<section className="world-time-debug" aria-label="时间调试面板"><div className="world-time-debug-head"><strong>时间预览</strong><output>{shownTime}</output></div><label htmlFor="world-time-slider">拖动查看天空与光照</label><input id="world-time-slider" type="range" min="0" max="1439" step="1" value={shownMinutes} onChange={event=>setDebugMinutes(Number(event.target.value))}/><div className="world-time-presets">{([[360,'清晨'],[720,'正午'],[1080,'傍晚'],[1380,'夜晚']] as [number, string][]).map(([minutes,label])=><button key={minutes} type="button" onClick={()=>setDebugMinutes(minutes)}>{label}</button>)}</div><button className="world-time-reset" type="button" disabled={debugMinutes===null} onClick={()=>setDebugMinutes(null)}>恢复设备时间</button></section>}
      {!selected&&<div className="world-intro"><h1>欢迎来到{settings.islandName}</h1><p>今天，去哪里逛逛？点击一栋建筑，发现里面的故事。</p></div>}
      {!fallback&&!selected&&<div className="world-labels">{labels.map(label=><button key={label.id} className="world-label" style={{left:label.x,top:label.y,display:label.visible?'':'none'}} onClick={()=>visit(label.id)} tabIndex={-1} aria-hidden="true">{PLACE_MAP[label.id].short}<span/></button>)}</div>}
      {!fallback&&<div className="world-camera" aria-label="镜头控制"><button className="world-icon-button" disabled={!rotateBounds.includes('l')||!!selected} onClick={()=>engine.current?.rotate(-.25)} aria-label="向左环视"><WorldIcon name="left"/></button><button className="world-icon-button" onClick={()=>{if(selected)close();else engine.current?.reset();}} aria-label="回到全景"><WorldIcon name="home"/></button><button className="world-icon-button" disabled={!rotateBounds.includes('r')||!!selected} onClick={()=>engine.current?.rotate(.25)} aria-label="向右环视"><WorldIcon name="right"/></button></div>}
      <nav className="world-nav" ref={nav} aria-label={`${settings.islandName}地点目录`}>{PLACES.map(p=><button key={p.id} data-place={p.id} aria-current={route.place===p.id?'location':undefined} onClick={()=>visit(p.id)} style={{'--place-color':p.color} as CustomCSS}><WorldIcon name={p.id}/><span>{p.short}</span><span className="nav-dot"/></button>)}</nav>
      {!selected&&<p className="world-help">{fallback?'静态预览 · 使用目录探索':'拖动环视 · 滚轮缩放'}<span>慢慢逛，不着急。</span></p>}
      {selected&&<PlacePanel key={selected.id} place={selected} islandName={settings.islandName} onClose={close} onOpenPost={openPost} onScroll={(top: number)=>placeScroll.current.set(selected.id,top)} restoreScroll={placeScroll.current.get(selected.id)} returnPostSlug={focusPostSlug} onFocusRestored={focusRestored}/>}
    </div>}
    {route.post&&<Suspense fallback={<div className="reader-boot" role="status">正在展开这篇故事…</div>}><ArticleReader slug={route.post} siteName={settings.name} islandName={settings.islandName} onResolvedPlace={resolvedArticlePlace} onReturn={returnFromPost} onNavigatePost={navigatePost} onHome={goHome}/></Suspense>}
    {error&&<div className="world-error" role="status"><span>{error}</span><button onClick={()=>location.reload()}>重新载入</button><button aria-label="关闭提示" onClick={()=>setError(null)}><WorldIcon name="close" width="16" height="16"/></button></div>}
    {debug&&stats&&<output className="world-stats">{stats.fps} FPS · {stats.drawCalls} draws · {stats.triangles.toLocaleString()} triangles · ready {stats.readyMs??'…'} ms · {phase}</output>}
  </main>;
}
