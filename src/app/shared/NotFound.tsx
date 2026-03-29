export const NotFound = () => (
  <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e0e0e0] flex flex-col items-center justify-center gap-4 p-8 text-center">
    <p className="text-[5rem] font-black leading-none">404</p>
    <p className="text-lg font-bold">ページが見つかりません</p>
    <p className="text-sm text-[#888]">
      URLが間違っているか、ページが削除された可能性があります。
    </p>
    <a
      href="/"
      className="px-5 py-2 bg-[#1a1a1a] dark:bg-[#e0e0e0] text-white dark:text-[#111] rounded-lg font-semibold text-sm no-underline"
    >
      トップページへ
    </a>
  </div>
);
