# My Portfolio

佐藤康樹のポートフォリオ兼Webアプリケーション。

## 概要

公開ポートフォリオと、認証が必要なプロダクティビティアプリを組み合わせたフルスタックWebアプリ。
アプリはプラットフォーム化されており、Marketplace からインストール・アンインストールが可能。

## 機能

- **ポートフォリオ** — プロフィール・学歴・職歴・スキルの公開ページ
- **アプリプラットフォーム** — Marketplace でアプリを導入・管理できる拡張可能な基盤
- **クイズアプリ** — 問題集の作成・管理・練習。GeminiによるPDFからの問題自動生成に対応
- **時間割アプリ** — 授業スケジュールの管理。通知設定・時限設定は設定ページから変更可能
- **動画アプリ** — Google Drive 上の動画の管理・再生
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
