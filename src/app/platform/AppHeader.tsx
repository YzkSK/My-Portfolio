import type { ReactNode } from 'react';
import { AppMenu } from '../shell/AppMenu';

type AppHeaderProps = {
  title: string;
  /** 戻るボタン押下時の処理（省略時は非表示） */
  onBack?: () => void;
  /** 戻るボタンのラベル（デフォルト: '← 戻る'） */
  backLabel?: string;
  /** 右側のアクション */
  actions?: ReactNode;
  /** AppMenu ハンバーガーを表示するか（デフォルト: true） */
  showMenu?: boolean;
};

export const AppHeader = ({
  title,
  onBack,
  backLabel = '← 戻る',
  actions,
  showMenu = true,
}: AppHeaderProps) => (
  <header className="app-header">
    {onBack ? (
      <button className="app-header-back-btn" onClick={onBack}>
        {backLabel}
      </button>
    ) : showMenu ? (
      <AppMenu />
    ) : null}
    <h1 className="app-page-title">{title}</h1>
    {actions && <div className="app-header-actions">{actions}</div>}
  </header>
);
