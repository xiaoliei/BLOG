import { useEffect, useRef } from 'react';
import { IconClock, IconClose, IconTag } from './icons.jsx';

/* 文章详情弹层：Esc / 点击遮罩关闭，打开时锁定页面滚动 */
export default function ArticleModal({ post, module, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const prevActive = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ '--mod-accent': module.accent, '--mod-accent-dark': module.accentDark }}
      >
        <button ref={closeRef} type="button" className="modal__close" aria-label="关闭" onClick={onClose}>
          <IconClose />
        </button>
        <span className="modal__badge">{module.title}</span>
        <h2 id="modal-title" className="modal__title">
          {post.title}
        </h2>
        <div className="modal__meta">
          <span>
            <IconClock /> {post.date}
          </span>
          <span>{post.readTime} 分钟阅读</span>
        </div>
        <div className="modal__tags">
          <IconTag />
          {post.tags.map((tag) => (
            <span key={tag} className="modal__tag">
              {tag}
            </span>
          ))}
        </div>
        <p className="modal__excerpt">{post.excerpt}</p>
        <p className="modal__note">完整正文正在整理归档，先读读摘要吧。</p>
      </div>
    </div>
  );
}
