import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { getPost, getPosts, submitViewOnce } from '../lib/api.ts';
import { placeForModule } from './places.ts';
import type { PlaceInfo } from './places.ts';
import ArticleComments from './ArticleComments.tsx';
import type { CustomCSS } from './WorldAppTypes.ts';
import type { PostDetail, PostListItem as ApiPostListItem } from '../types/api.ts';
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
}

export default function ArticleReader({ slug, siteName, islandName, onResolvedPlace, onReturn, onNavigatePost }: ArticleReaderProps) {
  const [article, setArticle] = useState<ArticleState>({ status: 'loading', post: null });
  const [retry, setRetry] = useState(0);
  const [neighbors, setNeighbors] = useState<ApiPostListItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const place: PlaceInfo | null = article.post ? placeForModule(article.post.moduleSlug) : null;

  useEffect(() => {
    let alive = true;
    setArticle({ status: 'loading', post: null });
    setNeighbors([]);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    closeRef.current?.focus({ preventScroll: true });
    getPost(slug).then(post => {
      if (!alive) return;
      if (!post) { setArticle({ status: 'unavailable', post: null }); return; }
      setArticle({ status: 'ready', post });
      const foundPlace = placeForModule(post.moduleSlug);
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

  function trapFocus(event: React.KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const nodes = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),textarea:not([disabled])') || []).filter(node => node.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0] as HTMLElement, last = nodes[nodes.length - 1] as HTMLElement;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const currentIndex = neighbors.findIndex(item => item.slug === slug);
  const previous = currentIndex > 0 ? neighbors[currentIndex - 1] : null;
  const next = currentIndex >= 0 ? neighbors[currentIndex + 1] : null;

  return <section className="article-reader" role="dialog" aria-modal="true" aria-label={article.post?.title || '文章阅读'} onKeyDown={trapFocus}>
    <div className="reader-scroll" ref={scrollRef}>
      <div className="reader-shell">
        <nav className="reader-top" aria-label="文章导航">
          <button type="button" ref={closeRef} onClick={() => onReturn(place?.id || null)}>← 返回{place?.name || islandName}</button>
          <span>{siteName} <span aria-hidden="true">/</span> {islandName}手记</span>
        </nav>
        {article.status === 'loading' && <div className="reader-state" role="status"><span className="reader-cube" aria-hidden="true" />正在展开这篇故事…</div>}
        {article.status !== 'ready' && article.status !== 'loading' && <div className="reader-state" role="status">
          <h1>{article.status === 'missing' ? '这篇文章暂时找不到' : article.status === 'unavailable' ? '示例文章暂无正文' : '正文暂时无法载入'}</h1>
          <p>{article.status === 'missing' ? '文章可能已下线，或链接地址有误。' : article.status === 'unavailable' ? '当前使用的静态示例只有摘要。连接内容服务后可阅读完整文章。' : '网络似乎开了小差，请稍后重试。'}</p>
          {article.status === 'error' && <button type="button" onClick={() => setRetry(n => n + 1)}>重新载入</button>}
          <button type="button" onClick={() => onReturn(null)}>返回{islandName}</button>
        </div>}
        {article.status === 'ready' && article.post && <>
          <header className="reader-header" style={{ '--reader-accent': place?.color || '#318047' } as CustomCSS}>
            <p className="reader-kicker"><span className="reader-kicker-square" aria-hidden="true" />{article.post.moduleTitle || place?.name || `${islandName}手记`}</p>
            <h1 ref={headingRef} tabIndex={-1}>{article.post.title}</h1>
            <div className="reader-meta"><time dateTime={article.post.date}>{article.post.date}</time><span>约 {article.post.readTime || 1} 分钟</span>{Array.isArray(article.post.tags) && article.post.tags.length > 0 && <span>{article.post.tags.join(' · ')}</span>}</div>
            {article.post.excerpt && <p className="reader-deck">{article.post.excerpt}</p>}
          </header>
          {article.post.bodyMd?.trim() ? <div className="reader-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{article.post.bodyMd}</ReactMarkdown></div> : <div className="reader-empty"><h2>正文还在准备中</h2><p>这篇文章已有标题和摘要，作者尚未填入正文。</p></div>}
          <div className="reader-end" aria-hidden="true"><span /><span /><span /></div>
          <nav className="reader-neighbors" aria-label="继续阅读">
            {previous && <a href={`#post/${previous.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(previous.slug, place?.id ?? null); }}><small>上一篇</small><strong>{previous.title}</strong></a>}
            {next && <a href={`#post/${next.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(next.slug, place?.id ?? null); }}><small>下一篇</small><strong>{next.title}</strong></a>}
            <button type="button" onClick={() => onReturn(place?.id || null)}>返回{place?.name || islandName} →</button>
          </nav>
          <ArticleComments key={slug} slug={slug} />
        </>}
      </div>
    </div>
  </section>;
}
