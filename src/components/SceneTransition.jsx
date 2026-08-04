/* 方块式场景切换：steps() 模拟像素逐帧展开/收起 */
export default function SceneTransition({ phase, accent = '#0A101A', label = '' }) {
  if (!phase) return null;
  return (
    <div
      className={`scene-transition scene-transition--${phase}`}
      style={{ '--trans-accent': accent }}
      aria-hidden="true"
    >
      <div className="scene-transition-label">
        {label ? `${label} // 场景加载中` : 'SCENE TRANSITION'}
      </div>
    </div>
  );
}
