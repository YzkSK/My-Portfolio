import { Component, type ReactNode, type ErrorInfo } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; isChunkError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    const isChunkError = /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError|dynamically imported module/.test(
      error.message
    );
    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-[#f8f9fa] dark:bg-[#111]">
        <span className="text-5xl">⚠️</span>
        <p className="text-lg font-bold text-[#1a1a1a] dark:text-[#e0e0e0]">
          {this.state.isChunkError
            ? 'アプリの読み込みに失敗しました'
            : '予期しないエラーが発生しました'}
        </p>
        <p className="text-sm text-[#888]">
          {this.state.isChunkError
            ? 'キャッシュが古くなっている可能性があります。ページを再読み込みしてください。'
            : 'ページを再読み込みするか、しばらくしてから再試行してください。'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 bg-[#1a1a1a] dark:bg-[#e0e0e0] text-white dark:text-[#111] rounded-lg font-semibold text-sm"
        >
          再読み込み
        </button>
      </div>
    );
  }
}
