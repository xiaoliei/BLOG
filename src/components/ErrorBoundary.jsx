import { Component } from 'react';

/* 顶层错误边界：捕获子树渲染/生命周期错误，
   避免整个 React 树卸载后只剩 body 的羊毛背景。 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message
        ? String(this.state.error.message)
        : String(this.state.error);
      return (
        <div className="room-root room-root--error">
          <div className="room-error">
            <strong>RENDER · 渲染失败</strong>
            <pre>{msg}</pre>
            <p>请把这段错误（以及浏览器控制台的完整堆栈）反馈给开发者。</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
