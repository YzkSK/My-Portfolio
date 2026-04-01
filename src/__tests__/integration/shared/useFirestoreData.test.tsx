// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { AppLoadingProvider } from '@/app/shared/AppLoadingContext';
import { useFirestoreData } from '@/app/shared/useFirestoreData';
import type { ReactNode } from 'react';

const { mockDoc, mockGetDoc } = vi.hoisted(() => ({
  mockDoc: vi.fn(),
  mockGetDoc: vi.fn(),
}));

vi.mock('@/app/shared/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppLoadingProvider initialKeys={[]}>{children}</AppLoadingProvider>
);

const defaultOpts = {
  path: 'users/uid/quiz/data',
  parse: (raw: Record<string, unknown>) => raw as { value: string },
  loadingKey: 'test',
  initialData: { value: '' },
};

const makeUser = (uid = 'uid123') => ({ uid } as { uid: string } as never);

describe('useFirestoreData (結合テスト)', () => {
  it('currentUser が null の場合は getDoc を呼ばず loading=true のまま', async () => {
    const { result } = renderHook(
      () => useFirestoreData({ ...defaultOpts, currentUser: null }),
      { wrapper },
    );
    // null の場合は effect が早期 return するため loading は最終的に false にならない
    expect(result.current.loading).toBe(true);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('ドキュメントが存在する場合は data に parse 結果がセットされる', async () => {
    mockDoc.mockReturnValue('docRef');
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ value: 'hello' }),
    });

    const { result } = renderHook(
      () => useFirestoreData({ ...defaultOpts, currentUser: makeUser() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 'hello' });
    expect(result.current.dbError).toBe(false);
  });

  it('ドキュメントが存在しない場合は initialData のまま', async () => {
    mockDoc.mockReturnValue('docRef');
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const { result } = renderHook(
      () => useFirestoreData({ ...defaultOpts, currentUser: makeUser() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: '' });
    expect(result.current.dbError).toBe(false);
  });

  it('Firestore エラー時は dbError=true になる', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDoc.mockReturnValue('docRef');
    mockGetDoc.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(
      () => useFirestoreData({ ...defaultOpts, currentUser: makeUser() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dbError).toBe(true);
    consoleSpy.mockRestore();
  });

  it('onAfterLoad がロード成功後に呼ばれる', async () => {
    mockDoc.mockReturnValue('docRef');
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ value: 'loaded' }),
    });
    const onAfterLoad = vi.fn();

    const { result } = renderHook(
      () => useFirestoreData({ ...defaultOpts, currentUser: makeUser(), onAfterLoad }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onAfterLoad).toHaveBeenCalledWith({ value: 'loaded' });
  });

  it('setData で data を直接更新できる', async () => {
    mockDoc.mockReturnValue('docRef');
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const { result } = renderHook(
      () => useFirestoreData({ ...defaultOpts, currentUser: makeUser() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setData({ value: 'updated' }));
    expect(result.current.data).toEqual({ value: 'updated' });
  });
});
