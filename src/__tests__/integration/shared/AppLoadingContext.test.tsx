// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { AppLoadingProvider, useSetLoading } from '@/app/shared/AppLoadingContext';

afterEach(() => cleanup());

// useSetLoading を外部から呼べるようにするテスト用コンポーネント
let capturedSetLoading: (key: string, loading: boolean) => void;
const TestConsumer = () => {
  capturedSetLoading = useSetLoading();
  return null;
};

// render() のコンテナ内に絞って検索する
const getOverlay = (container: HTMLElement) =>
  container.querySelector('.app-loading-overlay');

describe('AppLoadingContext (結合テスト)', () => {
  it('initialKeys があればオーバーレイが表示状態になる', () => {
    const { container } = render(
      <AppLoadingProvider initialKeys={['auth']}>
        <TestConsumer />
      </AppLoadingProvider>,
    );
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(false);
  });

  it('initialKeys が空ならオーバーレイは非表示状態になる', () => {
    const { container } = render(
      <AppLoadingProvider initialKeys={[]}>
        <TestConsumer />
      </AppLoadingProvider>,
    );
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(true);
  });

  it('setLoading(key, false) で initialKey を解除するとオーバーレイが非表示になる', () => {
    const { container } = render(
      <AppLoadingProvider initialKeys={['auth']}>
        <TestConsumer />
      </AppLoadingProvider>,
    );
    act(() => capturedSetLoading('auth', false));
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(true);
  });

  it('複数キーがすべて解除されて初めて非表示になる', () => {
    const { container } = render(
      <AppLoadingProvider initialKeys={['auth', 'data']}>
        <TestConsumer />
      </AppLoadingProvider>,
    );
    act(() => capturedSetLoading('auth', false));
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(false);

    act(() => capturedSetLoading('data', false));
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(true);
  });

  it('setLoading(key, true) で新しいキーを追加するとオーバーレイが再表示される', () => {
    const { container } = render(
      <AppLoadingProvider initialKeys={[]}>
        <TestConsumer />
      </AppLoadingProvider>,
    );
    act(() => capturedSetLoading('quiz', true));
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(false);

    act(() => capturedSetLoading('quiz', false));
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(true);
  });

  it('同じキーを複数回 true にしても 1 つとして扱う', () => {
    const { container } = render(
      <AppLoadingProvider initialKeys={[]}>
        <TestConsumer />
      </AppLoadingProvider>,
    );
    act(() => {
      capturedSetLoading('key', true);
      capturedSetLoading('key', true);
    });
    // 1 回 false にするだけで解除される
    act(() => capturedSetLoading('key', false));
    expect(getOverlay(container)?.classList.contains('app-loading-overlay--done')).toBe(true);
  });
});
