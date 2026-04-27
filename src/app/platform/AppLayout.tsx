import type { ReactNode } from 'react';
import { AppMenu } from '../shell/AppMenu';
import { AppFooter } from '../shell/AppFooter';
import { DbErrorBanner } from '../shared/DbErrorBanner';
import '../shared/app.css';

type ToastItem = { id: number; msg: string; type: 'normal' | 'error' | 'warning' };

type AppLayoutProps = {
  title?: string;
  /** ヘッダー左側（省略時: AppMenu ハンバーガー） */
  headerLeft?: ReactNode;
  /** ヘッダー右側のアクション */
  headerActions?: ReactNode;
  /** フルカスタムヘッダー（指定時は title / headerLeft / headerActions を無視） */
  header?: ReactNode;
  children: ReactNode;
  /** <main> の追加クラス名 */
  className?: string;
  /** ルート <div> の追加クラス名（既存の tt-page, app-dashboard 等との互換用） */
  pageClassName?: string;
  /** DbErrorBanner を表示するか */
  dbError?: boolean;
  /** トースト一覧 */
  toasts?: ToastItem[];
};

export const AppLayout = ({
  title,
  headerLeft,
  headerActions,
  header,
  children,
  className,
  pageClassName,
  dbError,
  toasts,
}: AppLayoutProps) => {
  const pageClass = ['app-page', pageClassName].filter(Boolean).join(' ');
  // className を明示的に渡した場合は app-main を上書き（Timetable など独自レイアウトのアプリ向け）
  const mainClass = className !== undefined ? className : 'app-main';

  return (
    <div className={pageClass}>
      {header ?? (
        <header className="app-header">
          {headerLeft !== undefined ? headerLeft : <AppMenu />}
          {title && <h1 className="app-page-title">{title}</h1>}
          {headerActions && <div className="app-header-actions">{headerActions}</div>}
        </header>
      )}
      {dbError && <DbErrorBanner />}
      <main className={mainClass}>
        {children}
      </main>
      <AppFooter />
      {toasts && toasts.length > 0 && (
        <div className="app-toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`app-toast app-toast--${t.type}`}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
