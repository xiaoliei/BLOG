import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/* 顶层错误边界：捕获子树渲染/生命周期错误，
   避免整个 React 树卸载后只剩 body 的羊毛背景。 */
interface ErrorBoundaryProps { children?: ReactNode; }
interface ErrorBoundaryState { error: Error | null; }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
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
