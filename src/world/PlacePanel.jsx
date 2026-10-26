import { useEffect, useRef, useState } from 'react';
import { getPosts, getStaticPosts } from '../lib/api.js';
import WorldIcon from '../components/icons/WorldIcon.jsx';

// 地点面板：右侧文章列表面板，由 WorldApp 在选中某地点时挂载。
// 数据来源优先内容服务，超时 8 秒或格式异常时回退到内置示例文章。
export default function PlacePanel({ place, islandName, onClose, onOpenPost, onScroll, restoreScroll, returnPostSlug, onFocusRestored }) {
  const [content, setContent] = useState({ status: 'loading', posts: [] });
  const [retry, setRetry] = useState(0);
  const heading = useRef(null), list = useRef(null);
  useEffect(() => { if (!returnPostSlug) heading.current?.focus({ preventScroll: true }); }, [place.id]);
  useEffect(() => {
    if (content.status === 'loading' || !list.current) return;
    list.current.scrollTop = restoreScroll || 0;
    if (returnPostSlug) {
      const entry = Array.from(list.current.querySelectorAll('[data-post]')).find(node => node.dataset.post === returnPostSlug);
      if (entry) { entry.focus({ preventScroll: true }); onFocusRestored(); }
    }
  }, [content.status, restoreScroll, returnPostSlug, onFocusRestored]);
  useEffect(() => {
    let alive = true;
    let timer;
    setContent({ status: 'loading', posts: [] });
    const load = Promise.all(place.modules.map(moduleId => getPosts({ moduleId, limit: 12 })));
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 8000); });
    Promise.race([load, deadline]).then(lists => {
      if (!lists.every(Array.isArray)) throw new Error('invalid_content');
      if (alive) setContent({ status: 'ready', posts: lists.flat().sort((a, b) => String(b.date).localeCompare(String(a.date))) });
    }).catch(() => {
      if (alive) setContent({ status: 'sample', posts: place.modules.flatMap(moduleId => getStaticPosts({ moduleId })).sort((a, b) => String(b.date).localeCompare(String(a.date))) });
    }).finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); };
  }, [place.id, retry]);
  return <aside className="place-panel" data-place={place.id} aria-labelledby="place-title" style={{ '--place-color': place.color }}>
    <div className="place-panel-top"><span>{place.detail}</span><button className="world-icon-button" onClick={onClose} aria-label="关闭地点，回到全景"><WorldIcon name="close" /></button></div>
    <h2 id="place-title" ref={heading} tabIndex={-1}>{place.name}</h2>
    <p className="place-description">{place.description}</p>
    <div className="place-posts" ref={list} onScroll={event => onScroll(event.currentTarget.scrollTop)} aria-live="polite" aria-busy={content.status === 'loading'}>
      {content.status === 'loading' && <p className="content-message">正在翻找这里的故事…</p>}
      {content.status === 'sample' && <p className="content-message">暂时未连接内容服务，以下为示例文章。<button onClick={() => setRetry(n => n + 1)}>重新连接</button></p>}
      {content.status === 'ready' && !content.posts.length && <p className="content-message">这里的故事还在准备中，先去别处逛逛吧。</p>}
      {content.posts.map((post, i) => <article className="world-post" key={post.slug || `${post.title}-${i}`}><div className="post-meta"><time dateTime={post.date}>{post.date}</time><span>{post.moduleTitle}</span></div><h3>{post.title}</h3><p>{post.excerpt}</p>{content.status === 'ready' && post.slug && <a href={`#post/${post.slug}`} data-post={post.slug} onClick={event => { event.preventDefault(); onOpenPost(post.slug, place.id); }}>阅读正文 <span aria-hidden="true">→</span></a>}</article>)}
    </div>
    <footer className="place-panel-footer"><span>{islandName}手记 · 文章摘要</span><button onClick={onClose}>继续逛逛 <WorldIcon name="right" width="15" height="15" /></button></footer>
  </aside>;
}
