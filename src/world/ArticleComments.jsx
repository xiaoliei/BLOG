import { useEffect, useState } from 'react';
import { getComments, submitComment } from '../lib/api.js';
import { localDateTime } from '../lib/local-time.js';

// 文章留言区：留言列表加载/重试与留言表单（含蜜糖字段）。
// 从 ArticleReader.jsx 抽出，按 slug 重新挂载时状态随 key 一起重置。
export default function ArticleComments({ slug }) {
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
      <div><strong>{item.author}</strong><time dateTime={item.createdAt}>{localDateTime(item.createdAt)}</time></div>
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
