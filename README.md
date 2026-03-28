# My Portfolio

佐藤康樹のポートフォリオ兼Webアプリケーション。

## 概要

公開ポートフォリオと、認証が必要なプロダクティビティアプリ（クイズ・時間割）を組み合わせたフルスタックWebアプリ。

## 機能

- **ポートフォリオ** — プロフィール・学歴・職歴・スキルの公開ページ
- **クイズアプリ** — 問題集の作成・管理・練習。GeminiによるPDFからの問題自動生成に対応
- **時間割アプリ** — 授業スケジュールの管理
- **プッシュ通知** — Firebase Cloud Messaging によるPWA通知（ブラウザ / iOS / Android対応）

## 技術スタック

| 分類 | 技術 |
|------|------|
| フロントエンド | React 19, TypeScript, Vite 6, TailwindCSS 4, Radix UI |
| バックエンド | Firebase (Auth / Firestore / Storage / Cloud Functions) |
| サーバーレス | Cloudflare Workers (通知用cronジョブ) |
| AI | Google Generative AI (Gemini) |
| メール | Resend |

## セットアップ

```bash
npm install
npm run dev
```

## コマンド

```bash
npm run dev       # 開発サーバー起動
npm run build     # プロダクションビルド
npm run lint      # ESLint実行
npm run preview   # ビルド結果のプレビュー
```

### Firebase Functions

```bash
cd firebase-functions
npm install
npm run serve     # ローカルエミュレーター起動
npm run deploy    # デプロイ
```

### Cloudflare Worker

```bash
cd workers/notification-cron
# Wrangler CLI を使用
```
