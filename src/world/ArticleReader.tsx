import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { Options } from 'react-markdown';
import { getPost, getPosts, submitViewOnce } from '../lib/api.ts';
import { placeForModule } from './places.ts';
import type { PlaceInfo } from './places.ts';
import ArticleComments from './ArticleComments.tsx';
import type { CustomCSS } from './WorldAppTypes.ts';
import type { PostDetail, PostListItem as ApiPostListItem } from '../types/api.ts';
import { extractHeadings, rehypeHeadingIds } from './reader-toc.ts';
import './reader.css';

type ArticleStatus = 'loading' | 'ready' | 'missing' | 'error' | 'unavailable';
interface ArticleState { status: ArticleStatus; post: PostDetail | null; }

interface ArticleReaderProps {
  slug: string;
  siteName: string;
  islandName: string;
  onResolvedPlace: (placeId: string | null) => void;
  onReturn: (placeId: string | null) => void;
  onNavigatePost: (slug: string, placeId: string | null) => void;
  onHome: () => void;
}

export default function ArticleReader({ slug, siteName, islandName, onResolvedPlace, onReturn, onNavigatePost, onHome }: ArticleReaderProps) {
  const [article, setArticle] = useState<ArticleState>({ status: 'loading', post: null });
  const [retry, setRetry] = useState(0);
  const [neighbors, setNeighbors] = useState<ApiPostListItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef('');
  const post = article.post;
  const place: PlaceInfo | null = post ? placeForModule(post.moduleSlug) : null;
  const bodyMd = post?.bodyMd || '';
  const headings = useMemo(() => extractHeadings(bodyMd), [bodyMd]);
  /* id 由 markdown 顺序决定，正文与目录用同一批，见 reader-toc.ts。 */
  const rehypePlugins = useMemo<Options['rehypePlugins']>(() => [rehypeSanitize, [rehypeHeadingIds, { ids: headings.map(item => item.id) }]], [headings]);

  useEffect(() => {
    let alive = true;
    setArticle({ status: 'loading', post: null });
    setNeighbors([]);
    activeRef.current = '';
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)';
    backRef.current?.focus({ preventScroll: true });
    getPost(slug).then(value => {
      if (!alive) return;
      if (!value) { setArticle({ status: 'unavailable', post: null }); return; }
      setArticle({ status: 'ready', post: value });
      const foundPlace = placeForModule(value.moduleSlug);
      onResolvedPlace(foundPlace?.id || null);
      submitViewOnce(slug).catch(() => {});
      if (foundPlace) {
        /* 正文只在 API 存在，因此这里的邻居列表必然是 API 行，可按 slug 排序。
           静态回退下 getPost 已返回 null 并提前 return，走不到这里。 */
        Promise.all(foundPlace.modules.map(moduleId => getPosts({ moduleId }))).then(lists => {
          const neighbors = lists.flat().filter((item): item is ApiPostListItem => 'slug' in item);
          if (alive) setNeighbors(neighbors.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.slug.localeCompare(b.slug)));
        }).catch(() => {});
      }
    }).catch((error: unknown) => {
      if (alive) setArticle({ status: /HTTP 404/.test((error as Error)?.message || '') ? 'missing' : 'error', post: null });
    });
    return () => { alive = false; };
  }, [slug, retry, onResolvedPlace]);

  useEffect(() => {
    if (article.status === 'ready') headingRef.current?.focus({ preventScroll: true });
  }, [article.status, slug]);

  /* 阅读进度与目录高亮：滚动时用 rAF 合并，只在状态变化时改 DOM。 */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || article.status !== 'ready') return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = node.scrollHeight - node.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, node.scrollTop / max)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${ratio})`;
      let active = '';
      for (const heading of node.querySelectorAll<HTMLElement>('.reader-body h2[id], .reader-body h3[id]')) {
        if (heading.getBoundingClientRect().top <= 160) active = heading.id;
        else break;
      }
      if (active === activeRef.current) return;
      activeRef.current = active;
      rootRef.current?.querySelectorAll<HTMLElement>('[data-toc]').forEach(link => {
        if (link.dataset.toc === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    node.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { node.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [article.status, slug, headings]);

  /* 目录跳转只滚动当前阅读容器：改 hash 会触发 WorldApp 的路由，把文章关掉。 */
  function jumpTo(event: React.MouseEvent<HTMLAnchorElement>, id: string): void {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }

  const currentIndex = neighbors.findIndex(item => item.slug === slug);
  const previous = currentIndex > 0 ? neighbors[currentIndex - 1] : null;
  const next = currentIndex >= 0 ? neighbors[currentIndex + 1] : null;
  const tocLinks = headings.map(item => <a key={item.id} href={`#post/${slug}`} data-toc={item.id} className={`toc-level-${item.level}`} onClick={event => jumpTo(event, item.id)}>{item.text}</a>);

  return <section ref={rootRef} className="article-reader" aria-label={post?.title || '文章阅读'} style={{ '--reader-accent': place?.color || '#318047' } as CustomCSS}>
    <div className="reader-scroll" ref={scrollRef}>
      <header className="reader-bar">
        <div className="reader-bar-inner">
          <button type="button" className="reader-back" ref={backRef} onClick={() => onReturn(place?.id || null)}>
            <span aria-hidden="true">←</span> 返回{place?.name || islandName}
          </button>
          <nav className="reader-crumbs" aria-label="当前位置">
            <button type="button" onClick={onHome}>{siteName}</button>
            <span aria-hidden="true">/</span>
            <span>{place?.name || islandName}手记</span>
          </nav>
          <button type="button" className="reader-home" onClick={onHome}>回到全景</button>
        </div>
        <div className="reader-progress" ref={progressRef} aria-hidden="true" />
      </header>
      {post && article.status === 'ready' ? <div className={`reader-shell${place ? '' : ' reader-shell--no-shelf'}`}>
        {place && <aside className="reader-side reader-shelf" aria-label={`${place.name}的文章`}>
          <div className="reader-side-head">
            <p className="reader-side-title">书架</p>
            <p className="reader-shelf-name">{place.name}手记</p>
            <p className="reader-shelf-count">{neighbors.length > 0 ? `${neighbors.length} 篇` : '同地点'}</p>
          </div>
          {neighbors.length > 0 && <ol className="reader-shelf-list">
            {neighbors.map(item => <li key={item.slug} className={item.slug === slug ? 'is-current' : undefined}>
              {item.slug === slug
                ? <span className="reader-shelf-current"><time dateTime={item.date}>{item.date}</time><strong>{item.title}</strong></span>
                : <a href={`#post/${item.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(item.slug, place.id); }}><time dateTime={item.date}>{item.date}</time><strong>{item.title}</strong></a>}
            </li>)}
          </ol>}
          <button type="button" className="reader-shelf-more" onClick={() => onReturn(place.id)}>继续逛逛{place.name} <span aria-hidden="true">→</span></button>
        </aside>}
        <article className="reader-main">
          <header className="reader-header">
            <p className="reader-kicker"><span className="reader-kicker-square" aria-hidden="true" />{post.moduleTitle || place?.name || `${islandName}手记`}</p>
            <h1 ref={headingRef} tabIndex={-1}>{post.title}</h1>
            <div className="reader-meta"><time dateTime={post.date}>{post.date}</time><span>约 {post.readTime || 1} 分钟</span>{Array.isArray(post.tags) && post.tags.length > 0 && <span>{post.tags.join(' · ')}</span>}</div>
            {post.excerpt && <p className="reader-deck">{post.excerpt}</p>}
          </header>
          {headings.length > 0 && <details className="reader-toc-inline">
            <summary>本文目录</summary>
            <nav aria-label="本文目录">{tocLinks}</nav>
          </details>}
          {bodyMd.trim() ? <div className="reader-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins}>{bodyMd}</ReactMarkdown></div> : <div className="reader-empty"><h2>正文还在准备中</h2><p>这篇文章已有标题和摘要，作者尚未填入正文。</p></div>}
          <div className="reader-end" aria-hidden="true"><span /><span /><span /></div>
          <nav className="reader-neighbors" aria-label="继续阅读">
            {previous && <a href={`#post/${previous.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(previous.slug, place?.id ?? null); }}><small>上一篇</small><strong>{previous.title}</strong></a>}
            {next && <a href={`#post/${next.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(next.slug, place?.id ?? null); }}><small>下一篇</small><strong>{next.title}</strong></a>}
            <button type="button" onClick={() => onReturn(place?.id || null)}>返回{place?.name || islandName} →</button>
          </nav>
          <ArticleComments key={slug} slug={slug} />
        </article>
        <aside className="reader-side reader-toc" aria-label="本文目录">
          <div className="reader-side-head"><p className="reader-side-title">本文目录</p></div>
          {headings.length > 0 ? <nav aria-label="本文目录">{tocLinks}</nav> : <p className="reader-side-empty">这篇没有小标题。</p>}
          <dl className="reader-facts">
            <div><dt>发表于</dt><dd><time dateTime={post.date}>{post.date}</time></dd></div>
            <div><dt>阅读</dt><dd>约 {post.readTime || 1} 分钟</dd></div>
            {post.views > 0 && <div><dt>浏览</dt><dd>{post.views} 次</dd></div>}
          </dl>
          {Array.isArray(post.tags) && post.tags.length > 0 && <ul className="reader-tags">{post.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
        </aside>
      </div> : <div className="reader-shell reader-shell--state">
        {article.status === 'loading' && <div className="reader-state" role="status"><span className="reader-cube" aria-hidden="true" />正在展开这篇故事…</div>}
        {article.status !== 'ready' && article.status !== 'loading' && <div className="reader-state" role="status">
          <h1>{article.status === 'missing' ? '这篇文章暂时找不到' : article.status === 'unavailable' ? '示例文章暂无正文' : '正文暂时无法载入'}</h1>
          <p>{article.status === 'missing' ? '文章可能已下线，或链接地址有误。' : article.status === 'unavailable' ? '当前使用的静态示例只有摘要。连接内容服务后可阅读完整文章。' : '网络似乎开了小差，请稍后重试。'}</p>
          {article.status === 'error' && <button type="button" onClick={() => setRetry(n => n + 1)}>重新载入</button>}
          <button type="button" onClick={() => onReturn(null)}>返回{islandName}</button>
        </div>}
      </div>}
    </div>
  </section>;
}