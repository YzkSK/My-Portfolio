// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '@/app/platform/AppLayout';

afterEach(() => cleanup());

vi.mock('@/app/shell/AppMenu', () => ({
  AppMenu: () => <button>メニュー</button>,
}));

vi.mock('@/app/shell/AppFooter', () => ({
  AppFooter: () => <footer data-testid="app-footer">footer</footer>,
}));

vi.mock('@/app/shared/DbErrorBanner', () => ({
  DbErrorBanner: () => <div data-testid="db-error-banner">DBエラー</div>,
}));

const renderLayout = (props: Parameters<typeof AppLayout>[0]) =>
  render(
    <MemoryRouter>
      <AppLayout {...props} />
    </MemoryRouter>,
  );

describe('AppLayout', () => {
  it('title を表示する', () => {
    renderLayout({ title: 'テストページ', children: <p>コンテンツ</p> });
    expect(screen.getByText('テストページ')).toBeTruthy();
  });

  it('children を表示する', () => {
    renderLayout({ title: 'テスト', children: <p>本文コンテンツ</p> });
    expect(screen.getByText('本文コンテンツ')).toBeTruthy();
  });

  it('dbError=true のとき DbErrorBanner を表示する', () => {
    renderLayout({ children: <p>内容</p>, dbError: true });
    expect(screen.getByTestId('db-error-banner')).toBeTruthy();
  });

  it('dbError=false のとき DbErrorBanner を表示しない', () => {
    renderLayout({ children: <p>内容</p>, dbError: false });
    expect(screen.queryByTestId('db-error-banner')).toBeNull();
  });

  it('toasts を表示する', () => {
    renderLayout({
      children: <p>内容</p>,
      toasts: [{ id: 1, msg: 'テストトースト', type: 'normal' }],
    });
    expect(screen.getByText('テストトースト')).toBeTruthy();
  });

  it('AppFooter を常に表示する', () => {
    renderLayout({ children: <p>内容</p> });
    expect(screen.getByTestId('app-footer')).toBeTruthy();
  });

  it('カスタム header を使うとき title/AppMenu を上書きする', () => {
    renderLayout({
      header: <header data-testid="custom-header">カスタムヘッダー</header>,
      children: <p>内容</p>,
    });
    expect(screen.getByTestId('custom-header')).toBeTruthy();
    expect(screen.queryByText('メニュー')).toBeNull();
  });

  it('pageClassName が root div に追加される', () => {
    const { container } = renderLayout({
      pageClassName: 'my-custom-page',
      children: <p>内容</p>,
    });
    expect(container.firstChild).toHaveProperty(
      'className',
      expect.stringContaining('my-custom-page'),
    );
  });
});
