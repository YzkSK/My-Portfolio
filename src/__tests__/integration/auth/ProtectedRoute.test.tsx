// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/app/auth/ProtectedRoute';
import { useAuth } from '@/app/auth/AuthContext';

afterEach(() => cleanup());

vi.mock('@/app/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

const renderRoute = (children = <p>保護されたコンテンツ</p>) =>
  render(
    <MemoryRouter>
      <ProtectedRoute>{children}</ProtectedRoute>
    </MemoryRouter>,
  );

describe('ProtectedRoute (結合テスト)', () => {
  it('loading 中は何も描画しない', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, username: undefined, loading: true });
    const { container } = renderRoute();
    expect(container.firstChild).toBeNull();
  });

  it('未認証は 403 Forbidden を表示する', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, username: null, loading: false });
    renderRoute();
    expect(screen.getByText('403')).toBeTruthy();
    expect(screen.getByText('アクセス権限がありません')).toBeTruthy();
  });

  it('認証済み・username あり → 子要素を描画する', () => {
    mockUseAuth.mockReturnValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentUser: { uid: 'u1' } as any,
      username: 'testuser',
      loading: false,
    });
    renderRoute();
    expect(screen.getByText('保護されたコンテンツ')).toBeTruthy();
    expect(screen.queryByText(/ユーザー名が設定されていません/)).toBeNull();
  });

  it('認証済み・username=null → 子要素 + ユーザー名未設定バナーを描画する', () => {
    mockUseAuth.mockReturnValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentUser: { uid: 'u1' } as any,
      username: null,
      loading: false,
    });
    renderRoute();
    expect(screen.getByText('保護されたコンテンツ')).toBeTruthy();
    expect(screen.getByText(/ユーザー名が設定されていません/)).toBeTruthy();
    expect(screen.getByText('設定ページ')).toBeTruthy();
  });
});
