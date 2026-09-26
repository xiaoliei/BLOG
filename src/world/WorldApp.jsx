import { useEffect, useRef, useState } from 'react';
import { createWorldEngine } from './engine.js';
import { PLACES, PLACE_MAP, readWorldRoute } from './places.js';
import { getPosts, getStaticPosts } from '../lib/api.js';
import { useSystemClock } from '../hooks/useSystemClock.js';
import LandingClock from '../components/landing/LandingClock.jsx';
import Starfield from '../components/landing/Starfield.jsx';
import ScreenOverlays from '../components/landing/ScreenOverlays.jsx';
import './world.css';

function Icon({ name, ...props }) {
  const paths = {
    bookshop: <><path d="M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14"/><path d="M6 9h3M15 9h3M6 12h3M15 12h3"/></>,
    workshop: <><path d="m14 4 6 6-3 3-6-6zM12 10 4 18l2 2 8-8M5 4l15 15M4 3l3 1-3 3z"/></>,
    cottage: <><path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/></>,
    station: <><rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 10h14M12 3v7M7 18l-2 3M17 18l2 3M8 14h1M15 14h1"/></>,
    observatory: <><path d="m4 8 13-5 3 7-13 5zM6 13l-2 1-2-4 2-1M13 13v3m0 0-5 6m5-6 5 6"/></>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    home:<><path d="m3 7 9-4 9 4-9 5zM3 7v10l9 4 9-4V7M12 12v9"/></>,
    left:<path d="m14 5-7 7 7 7"/>,right:<path d="m10 5 7 7-7 7"/>,
    reset:<><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]||paths.home}</svg>;
}

function PlacePanel({ place, onClose }) {
  const [content,setContent]=useState({status:'loading',posts:[]});
  const [retry,setRetry]=useState(0);
  const heading=useRef(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[place.id]);
  useEffect(()=>{
    let alive=true;
    let timer;
    setContent({status:'loading',posts:[]});
    const load=Promise.all(place.modules.map(moduleId=>getPosts({moduleId,limit:12})));
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),8000);});
    Promise.race([load,deadline]).then(lists=>{
      if(!lists.every(Array.isArray))throw new Error('invalid_content');
      if(alive)setContent({status:'ready',posts:lists.flat().sort((a,b)=>String(b.date).localeCompare(String(a.date)))});
    }).catch(()=>{
      if(alive)setContent({status:'sample',posts:place.modules.flatMap(moduleId=>getStaticPosts({moduleId})).sort((a,b)=>String(b.date).localeCompare(String(a.date)))});
    }).finally(()=>clearTimeout(timer));
    return()=>{alive=false;clearTimeout(timer);};
  },[place.id,retry]);
  return <aside className="place-panel" data-place={place.id} aria-labelledby="place-title" style={{'--place-color':place.color}}>
    <div className="place-panel-top"><span>{place.detail}</span><button className="world-icon-button" onClick={onClose} aria-label="关闭地点，回到全景"><Icon name="close"/></button></div>
    <h2 id="place-title" ref={heading} tabIndex={-1}>{place.name}</h2>
    <p className="place-description">{place.description}</p>
    <div className="place-posts" aria-live="polite" aria-busy={content.status==='loading'}>
      {content.status==='loading'&&<p className="content-message">正在翻找这里的故事…</p>}
      {content.status==='sample'&&<p className="content-message">暂时未连接内容服务，以下为示例文章。<button onClick={()=>setRetry(n=>n+1)}>重新连接</button></p>}
      {content.status==='ready'&&!content.posts.length&&<p className="content-message">这里的故事还在准备中，先去别处逛逛吧。</p>}
      {content.posts.map((post,i)=><article className="world-post" key={post.slug||`${post.title}-${i}`}><div className="post-meta"><time>{post.date}</time><span>{post.moduleTitle}</span></div><h3>{post.title}</h3><p>{post.excerpt}</p></article>)}
    </div>
    <footer className="place-panel-footer"><span>港镇手记 · 文章摘要</span><button onClick={onClose}>继续逛逛 <Icon name="right" width="15" height="15"/></button></footer>
  </aside>;
}

export default function WorldApp(){
  const initialRoute=useRef(readWorldRoute(location.hash));
  const [route,setRoute]=useState(initialRoute.current);
  const [phase,setPhase]=useState(initialRoute.current.home?'world':'loading');
  const [ready,setReady]=useState(false),[error,setError]=useState(null),[fallback,setFallback]=useState(false),[skipEarth,setSkipEarth]=useState(false);
  const [labels,setLabels]=useState([]),[stats,setStats]=useState(null);
  const canvas=useRef(null),engine=useRef(null),nav=useRef(null);
  const clock=useSystemClock();
  const sceneVisible=phase==='world'||phase==='focused';
  const selected=PLACE_MAP[route.place];
  const debug=new URLSearchParams(location.search).has('worldDebug');
  function visit(id){location.hash=id?`home/${id}`:'home';}
  function close(){visit(null);requestAnimationFrame(()=>nav.current?.querySelector(`[data-place="${route.place}"]`)?.focus());}
  useEffect(()=>{
    let active=true;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    try{
      engine.current=createWorldEngine(canvas.current,{
        initialRoute:initialRoute.current,reducedMotion:motion.matches,
        onReady:()=>{if(active)setReady(true);},
        onPhase:next=>{if(!active)return;setPhase(next);if(next==='world'&&!readWorldRoute(location.hash).home)location.hash='home';},
        onSelect:id=>visit(id),onLabels:l=>{if(active)setLabels(l);},onStats:s=>{if(active)setStats(s);},
        onError:(message,earthOnly)=>{if(active){setError(message);if(earthOnly)setSkipEarth(true);else{setFallback(true);engine.current?.dispose();engine.current=null;setPhase(readWorldRoute(location.hash).home?'world':'idle');}setReady(true);}},
      });
    }catch{setFallback(true);setReady(true);setError('当前设备无法显示三维画面，已切换为静态预览。地点目录仍可使用。');setPhase(initialRoute.current.home?'world':'idle');}
    const hash=()=>{const next=readWorldRoute(location.hash);setRoute(next);engine.current?.navigate(next);if(!engine.current)setPhase(next.home?'world':'idle');};
    const key=e=>{
      if(e.key==='Escape'&&readWorldRoute(location.hash).place){visit(null);nav.current?.querySelector('button')?.focus();}
      if((e.key==='Enter'||e.key===' ')&&!readWorldRoute(location.hash).home&&e.target===document.body){e.preventDefault();engine.current?.enter();}
    };
    const reduce=()=>engine.current?.setReducedMotion(motion.matches);
    window.addEventListener('hashchange',hash);window.addEventListener('keydown',key);motion.addEventListener('change',reduce);
    return()=>{active=false;engine.current?.dispose();engine.current=null;window.removeEventListener('hashchange',hash);window.removeEventListener('keydown',key);motion.removeEventListener('change',reduce);};
  },[]);
  function enter(){if(fallback||skipEarth){visit(null);return;}engine.current?.enter();}
  return <main className={`world-app ${sceneVisible?'is-world':'is-landing'} ${selected?'has-place':''}`} data-phase={phase}>
    {!sceneVisible&&<div className="landing-root world-landing-background" aria-hidden="true"><Starfield/><ScreenOverlays/></div>}
    {fallback&&sceneVisible&&<img className="world-fallback" src={`${import.meta.env.BASE_URL}world/harbor-preview.png`} alt="卡通像素港镇概念预览：书店、工坊、车站与天文台沿海岸展开"/>}
    <canvas ref={canvas} className="world-canvas" aria-label="像素港镇三维场景，可使用地点目录探索" style={{visibility:fallback?'hidden':'visible'}}/>
    {!sceneVisible&&<div className={`landing-root world-landing-ui ${phase==='entering'?'is-entering':''}`}>
      <div className="world-clock"><LandingClock time={clock.time} date={clock.date}/></div>
      {phase!=='entering'&&<button className="world-enter" disabled={!ready} onClick={enter}>{!ready?'正在准备你的方块世界…':skipEarth||fallback?'直接浏览港镇':'点击进入像素世界'}<span aria-hidden="true">↓</span></button>}
    </div>}
    {sceneVisible&&<>
      <header className="world-header"><a href="#home" onClick={()=>{if(!selected)engine.current?.reset();}} className="world-brand" aria-label="小礼工坊，回到全景"><Icon name="home" width="30" height="30"/><span><strong>小礼工坊</strong><small>文字、代码，和一座小小的世界。</small></span></a><button className="world-return" aria-label="返回星球" onClick={()=>{location.hash='';}}><Icon name="reset" width="16" height="16"/><span>返回星球</span></button></header>
      {!selected&&<div className="world-intro"><h1>今天，去哪里逛逛？</h1><p>点击一栋建筑，发现里面的故事。</p></div>}
      {!fallback&&!selected&&<div className="world-labels">{labels.map(label=><button key={label.id} className="world-label" style={{left:label.x,top:label.y,display:label.visible?'':'none'}} onClick={()=>visit(label.id)} tabIndex={-1} aria-hidden="true">{PLACE_MAP[label.id].short}<span/></button>)}</div>}
      {!fallback&&<div className="world-camera" aria-label="镜头控制"><button className="world-icon-button" disabled={!!selected} onClick={()=>engine.current?.rotate(-.25)} aria-label="向左环视"><Icon name="left"/></button><button className="world-icon-button" onClick={()=>{if(selected)close();else engine.current?.reset();}} aria-label="回到全景"><Icon name="home"/></button><button className="world-icon-button" disabled={!!selected} onClick={()=>engine.current?.rotate(.25)} aria-label="向右环视"><Icon name="right"/></button></div>}
      <nav className="world-nav" ref={nav} aria-label="港镇地点目录">{PLACES.map(p=><button key={p.id} data-place={p.id} aria-current={route.place===p.id?'location':undefined} onClick={()=>visit(p.id)} style={{'--place-color':p.color}}><Icon name={p.id}/><span>{p.short}</span><span className="nav-dot"/></button>)}</nav>
      {!selected&&<p className="world-help">{fallback?'静态预览 · 使用目录探索':'拖动环视 · 滚轮缩放'}<span>慢慢逛，不着急。</span></p>}
      {selected&&<PlacePanel key={selected.id} place={selected} onClose={close}/>}
    </>}
    {error&&<div className="world-error" role="status"><span>{error}</span><button onClick={()=>location.reload()}>重新载入</button><button aria-label="关闭提示" onClick={()=>setError(null)}><Icon name="close" width="16" height="16"/></button></div>}
    {debug&&stats&&<output className="world-stats">{stats.fps} FPS · {stats.drawCalls} draws · {stats.triangles.toLocaleString()} triangles · {phase}</output>}
  </main>;
}
