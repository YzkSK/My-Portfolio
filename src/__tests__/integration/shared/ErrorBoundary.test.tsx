// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '@/app/shared/ErrorBoundary';

afterEach(() => cleanup());

// エラーを投げるテスト用コンポーネント
const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message);
};

// vitest がコンソールエラーを出力しないよう抑制
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary (結合テスト)', () => {
  it('エラーがなければ子要素をそのまま描画する', () => {
    render(
      <ErrorBoundary>
        <p>正常コンテンツ</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常コンテンツ')).toBeTruthy();
  });

  it('通常のエラーが発生すると 500 エラーページを表示する', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="something went wrong" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('予期しないエラーが発生しました')).toBeTruthy();
  });

  it('chunk load エラーが発生するとキャッシュクリア中の UI を表示する', () => {
    // caches / serviceWorker / location.reload をモック
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    });
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError message="Failed to fetch dynamically imported module: /app/quiz" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('キャッシュを更新しています...')).toBeTruthy();
  });
});
