export const DbErrorBanner = () => (
  <div className="app-db-error-banner">
    データベースに接続できませんでした。データが正しく表示されない場合があります。
    <button
      className="app-db-error-banner-btn"
      onClick={() => window.location.reload()}
    >
      再読み込み
    </button>
  </div>
);
