import { useMemo } from 'react';
import { LANDMARKS, PATHS, WORLD } from '../../config/world.js';
import PixelSprite from '../map/PixelSprite.jsx';

export default function SceneView({ landmark, onBack }) {
  const related = useMemo(() => {
    const ids = PATHS.filter((p) => p.from === landmark.id || p.to === landmark.id).map((p) =>
      p.from === landmark.id ? p.to : p.from
    );
    return ids.map((id) => LANDMARKS.find((l) => l.id === id)).filter(Boolean);
  }, [landmark]);

  const lastPost = landmark.posts[0];
  const biomeName = {
    grass: '平原',
    forest: '森林',
    mountain: '山地',
    desert: '沙漠',
    coast: '海岸',
  }[landmark.biome] || '未知';

  return (
    <div className={`scene-root scene--${landmark.biome}`} style={{ '--accent': landmark.accent, '--accent-dark': landmark.accentDark }}>
      <header className="scene-bar">
        <button type="button" className="mc-btn scene-back" onClick={onBack}>
          <span aria-hidden="true">◄</span> 返回地图
        </button>
        <div className="scene-bar-meta">
          <PixelSprite name={landmark.icon} size={26} />
          <b>{landmark.name}</b>
          <em>{landmark.module}</em>
        </div>
        <span className="scene-coords">X {landmark.x} · Z {landmark.y}</span>
      </header>

      <main className="scene-body">
        <section className="scene-hero">
          <div className="scene-hero-icon">
            <PixelSprite name={landmark.icon} size={96} />
          </div>
          <div className="scene-hero-text">
            <span className="scene-tagline">{landmark.module} // MODULE</span>
            <h1>{landmark.name}</h1>
            <p>{landmark.blurb}</p>
            <div className="scene-stats">
              <span><b>{landmark.posts.length}</b> 篇文章</span>
              <span><b>{biomeName}</b> 群系</span>
              <span><b>{lastPost.date}</b> 最近更新</span>
            </div>
          </div>
        </section>

        <div className="scene-grid">
          <section className="scene-posts" aria-label="文章列表">
            <h2>冒险日志 // POSTS</h2>
            <div className="post-list">
              {landmark.posts.map((post, idx) => (
                <article className="post-card" key={post.title}>
                  <div className="post-card-head">
                    <span className="post-index">#{String(idx + 1).padStart(2, '0')}</span>
                    <span className="post-date">{post.date}</span>
                    <span className="post-time">{post.readTime} min</span>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <div className="post-tags">
                    {post.tags.map((tag) => (
                      <span key={tag} className="tag">#{tag}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mc-btn post-read"
                    title="文章详情页为占位链接"
                    onClick={() => window.alert('文章详情页为占位链接，将在后续版本接入。')}
                  >
                    阅读 →
                  </button>
                </article>
              ))}
            </div>
          </section>

          <aside className="scene-side">
            <div className="scene-panel">
              <h3>传送点 // WAYPOINTS</h3>
              <p>从这里出发可以到达：</p>
              <ul className="scene-routes">
                {related.length === 0 && <li>（暂无相邻地标）</li>}
                {related.map((lm) => (
                  <li key={lm.id}>
                    <PixelSprite name={lm.icon} size={18} />
                    <span>{lm.name}</span>
                    <em>{lm.module}</em>
                  </li>
                ))}
              </ul>
              <button type="button" className="mc-btn scene-panel-btn" onClick={onBack}>
                回到地图前往 →
              </button>
            </div>

            <div className="scene-panel">
              <h3>战利品箱 // LOOT</h3>
              <ul className="scene-loot">
                <li><span>文章</span><b>{landmark.posts.length}</b></li>
                <li><span>标签</span><b>{new Set(landmark.posts.flatMap((p) => p.tags)).size}</b></li>
                <li><span>阅读时长</span><b>{landmark.posts.reduce((s, p) => s + p.readTime, 0)} min</b></li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      <footer className="scene-foot">
        <span>BLOG_OS · {WORLD.name} · {landmark.name}</span>
        <span>© 2026 · 由 64×64 块方块组成</span>
      </footer>
    </div>
  );
}
