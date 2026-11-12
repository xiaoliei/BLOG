import { useEffect, useRef, useState } from 'react';
import { getPosts, getStaticPosts } from '../lib/api.ts';
import type { PostListItem } from '../lib/api.ts';
import WorldIcon from '../components/icons/WorldIcon.tsx';
import type { CustomCSS } from './WorldAppTypes.ts';
import type { PlaceInfo } from './places.ts';

/* 面板只消费摘要字段，两种来源统一到这个形状：
 * API 行有正文入口，静态行没有（available 缺省）。 */
interface PostCard {
	key: string;
	moduleTitle: string;
	title: string;
	date: string;
	excerpt: string;
	/** 有正文可读；静态示例行无正文，为 false。 */
	available: boolean;
	/** 正文 slug，仅 API 行有。 */
	slug: string | null;
}

function toCard(post: PostListItem): PostCard {
	/* 静态行只有摘要、没有 slug；API 行必然带 slug。按 slug 判别即可。 */
	if ('slug' in post) {
		return { key: String(post.id), moduleTitle: post.moduleTitle, title: post.title, date: post.date, excerpt: post.excerpt, available: true, slug: post.slug };
	}
	return { key: post.key, moduleTitle: post.moduleTitle, title: post.title, date: post.date, excerpt: post.excerpt, available: false, slug: null };
}

interface ContentState {
	status: 'loading' | 'ready' | 'sample';
	posts: PostCard[];
}

interface PlacePanelProps {
  place: PlaceInfo;
  islandName: string;
  onClose: () => void;
  onOpenPost: (slug: string, placeId: string) => void;
  onScroll: (top: number) => void;
  restoreScroll: number | undefined;
  returnPostSlug: string | null;
  onFocusRestored: () => void;
}

// 地点面板：右侧文章列表面板，由 WorldApp 在选中某地点时挂载。
// 数据来源优先内容服务，超时 8 秒或格式异常时回退到内置示例文章。
export default function PlacePanel({ place, islandName, onClose, onOpenPost, onScroll, restoreScroll, returnPostSlug, onFocusRestored }: PlacePanelProps) {
  const [content, setContent] = useState<ContentState>({ status: 'loading', posts: [] });
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null), list = useRef<HTMLDivElement | null>(null);
  /* 只依赖 place.id：换地点才聚焦标题。若把 returnPostSlug 放进依赖，
     下面「恢复文章链接焦点」把它置回 null 会让本 effect 重跑，把刚恢复的焦点抢走。 */
  useEffect(() => { if (!returnPostSlug) heading.current?.focus({ preventScroll: true }); }, [place.id]);
  useEffect(() => {
    if (content.status === 'loading' || !list.current) return;
    list.current.scrollTop = restoreScroll || 0;
    if (returnPostSlug) {
      const entry = Array.from(list.current.querySelectorAll<HTMLElement>('[data-post]')).find(node => node.dataset.post === returnPostSlug);
      if (entry) { entry.focus({ preventScroll: true }); onFocusRestored(); }
    }
  }, [content.status, restoreScroll, returnPostSlug, onFocusRestored]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setContent({ status: 'loading', posts: [] });
    const load = Promise.all(place.modules.map(moduleId => getPosts({ moduleId, limit: 12 })));
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 8000); });
    Promise.race([load, deadline]).then(lists => {
      if (!lists.every(Array.isArray)) throw new Error('invalid_content');
      if (alive) setContent({ status: 'ready', posts: lists.flat().map(toCard).sort((a, b) => String(b.date).localeCompare(String(a.date))) });
    }).catch(() => {
      if (alive) setContent({ status: 'sample', posts: place.modules.flatMap(moduleId => getStaticPosts({ moduleId })).map(toCard).sort((a, b) => String(b.date).localeCompare(String(a.date))) });
    }).finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); };
  }, [place.id, retry, place.modules]);
  return <aside className="place-panel" data-place={place.id} aria-labelledby="place-title" style={{ '--place-color': place.color } as CustomCSS}>
    <div className="place-panel-top"><span>{place.detail}</span><button className="world-icon-button" onClick={onClose} aria-label="关闭地点，回到全景"><WorldIcon name="close" /></button></div>
    <h2 id="place-title" ref={heading} tabIndex={-1}>{place.name}</h2>
    <p className="place-description">{place.description}</p>
    <div className="place-posts" ref={list} onScroll={event => onScroll(event.currentTarget.scrollTop)} aria-live="polite" aria-busy={content.status === 'loading'}>
      {content.status === 'loading' && <p className="content-message">正在翻找这里的故事…</p>}
      {content.status === 'sample' && <p className="content-message">暂时未连接内容服务，以下为示例文章。<button onClick={() => setRetry(n => n + 1)}>重新连接</button></p>}
      {content.status === 'ready' && !content.posts.length && <p className="content-message">这里的故事还在准备中，先去别处逛逛吧。</p>}
      {content.posts.map(post => <article className="world-post" key={post.key}><div className="post-meta"><time dateTime={post.date}>{post.date}</time><span>{post.moduleTitle}</span></div><h3>{post.title}</h3><p>{post.excerpt}</p>{post.available && post.slug && <a href={`#post/${post.slug}`} data-post={post.slug} onClick={event => { event.preventDefault(); onOpenPost(post.slug as string, place.id); }}>阅读正文 <span aria-hidden="true">→</span></a>}</article>)}
    </div>
    <footer className="place-panel-footer"><span>{islandName}手记 · 文章摘要</span><button onClick={onClose}>继续逛逛 <WorldIcon name="right" width="15" height="15" /></button></footer>
  </aside>;
}
