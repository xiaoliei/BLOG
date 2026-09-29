import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { getComments, getPost, getPosts, submitComment, submitViewOnce } from '../lib/api.js';
import { placeForModule } from './places.js';
import './reader.css';

function Comments({ slug }) {
  const [items, setItems] = useState({ status: 'loading', rows: [] });
  const [retry, setRetry] = useState(0);
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let alive = true;
    setItems({ status: 'loading', rows: [] });
    getComments(slug).then(rows => {
      if (alive) setItems({ status: 'ready', rows: Array.isArray(rows) ? rows : [] });
    }).catch(() => {
      if (alive) setItems({ status: 'error', rows: [] });
    });
    return () => { alive = false; };
  }, [slug, retry]);

  async function send(event) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setFeedback(null);
    try {
      await submitComment(slug, { author, body, website });
      setBody('');
      setWebsite('');
      setFeedback({ type: 'success', text: '已提交，审核通过后会展示。' });
    } catch (error) {
      setFeedback({ type: 'error', text: error?.message || '提交失败，请稍后再试。' });
    } finally {
      setSending(false);
    }
  }

  return <section className="reader-comments" aria-labelledby="reader-comments-title">
    <h2 id="reader-comments-title">留言</h2>
    {items.status === 'loading' && <p className="reader-note">正在载入留言…</p>}
    {items.status === 'error' && <p className="reader-note">留言暂时无法载入。 <button type="button" onClick={() => setRetry(n => n + 1)}>重新载入</button></p>}
    {items.status === 'ready' && (items.rows.length ? <ol className="reader-comment-list">{items.rows.map(item => <li key={item.id}>
      <div><strong>{item.author}</strong><time dateTime={item.createdAt}>{String(item.createdAt).slice(0, 10)}</time></div>
      <p>{item.body}</p>
    </li>)}</ol> : <p className="reader-note">还没有留言，欢迎写下第一条。</p>)}
    <form className="reader-comment-form" onSubmit={send}>
      <h3>写下留言</h3>
      <label htmlFor="reader-comment-author">昵称</label>
      <input id="reader-comment-author" name="author" value={author} onChange={event => setAuthor(event.target.value)} required maxLength={24} autoComplete="name" />
      <label htmlFor="reader-comment-body">内容</label>
      <textarea id="reader-comment-body" name="body" value={body} onChange={event => setBody(event.target.value)} required maxLength={500} rows={5} />
      <div className="reader-honeypot" aria-hidden="true"><label htmlFor="reader-comment-website">网站</label><input id="reader-comment-website" name="website" value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></div>
      <p className="reader-form-hint">留言审核通过后公开显示。昵称最多 24 字，内容最多 500 字。</p>
      {feedback && <p className={`reader-feedback is-${feedback.type}`} role="status">{feedback.text}</p>}
      <button type="submit" disabled={sending}>{sending ? '正在提交…' : '提交留言'}</button>
    </form>
  </section>;
}

export default function ArticleReader({ slug, siteName, islandName, onResolvedPlace, onReturn, onNavigatePost }) {
  const [article, setArticle] = useState({ status: 'loading', post: null });
  const [retry, setRetry] = useState(0);
  const [neighbors, setNeighbors] = useState([]);
  const scrollRef = useRef(null);
  const headingRef = useRef(null);
  const closeRef = useRef(null);
  const place = article.post ? placeForModule(article.post.moduleSlug) : null;

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
        Promise.all(foundPlace.modules.map(moduleId => getPosts({ moduleId }))).then(lists => {
          if (alive) setNeighbors(lists.flat().sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.slug.localeCompare(b.slug)));
        }).catch(() => {});
      }
    }).catch(error => {
      if (alive) setArticle({ status: /HTTP 404/.test(error?.message || '') ? 'missing' : 'error', post: null });
    });
    return () => { alive = false; };
  }, [slug, retry, onResolvedPlace]);

  useEffect(() => {
    if (article.status === 'ready') headingRef.current?.focus({ preventScroll: true });
  }, [article.status, slug]);

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const nodes = Array.from(scrollRef.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),textarea:not([disabled])') || []).filter(node => node.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
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
        {article.status === 'ready' && <>
          <header className="reader-header" style={{ '--reader-accent': place?.color || '#318047' }}>
            <p className="reader-kicker"><span className="reader-kicker-square" aria-hidden="true" />{article.post.moduleTitle || place?.name || `${islandName}手记`}</p>
            <h1 ref={headingRef} tabIndex={-1}>{article.post.title}</h1>
            <div className="reader-meta"><time dateTime={article.post.date}>{article.post.date}</time><span>约 {article.post.readTime || 1} 分钟</span>{Array.isArray(article.post.tags) && article.post.tags.length > 0 && <span>{article.post.tags.join(' · ')}</span>}</div>
            {article.post.excerpt && <p className="reader-deck">{article.post.excerpt}</p>}
          </header>
          {article.post.bodyMd?.trim() ? <div className="reader-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{article.post.bodyMd}</ReactMarkdown></div> : <div className="reader-empty"><h2>正文还在准备中</h2><p>这篇文章已有标题和摘要，作者尚未填入正文。</p></div>}
          <div className="reader-end" aria-hidden="true"><span /><span /><span /></div>
          <nav className="reader-neighbors" aria-label="继续阅读">
            {previous && <a href={`#post/${previous.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(previous.slug, place?.id); }}><small>上一篇</small><strong>{previous.title}</strong></a>}
            {next && <a href={`#post/${next.slug}`} onClick={event => { event.preventDefault(); onNavigatePost(next.slug, place?.id); }}><small>下一篇</small><strong>{next.title}</strong></a>}
            <button type="button" onClick={() => onReturn(place?.id || null)}>返回{place?.name || islandName} →</button>
          </nav>
          <Comments key={slug} slug={slug} />
        </>}
      </div>
    </div>
  </section>;
}
