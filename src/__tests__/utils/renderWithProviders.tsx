// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLoadingProvider } from '@/app/shared/AppLoadingContext';

type Options = {
  initialPath?: string;
  initialLoadingKeys?: string[];
};

/**
 * テスト用の共通ラッパー。
 * MemoryRouter と AppLoadingProvider を付与する。
 * InstalledAppsContext / AuthContext が必要なテストは vi.mock で別途モックすること。
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { initialPath = '/', initialLoadingKeys = [] }: Options = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppLoadingProvider initialKeys={initialLoadingKeys}>
        {ui}
      </AppLoadingProvider>
    </MemoryRouter>,
  );
}
