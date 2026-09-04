# HEIC コンバーター

iPhone で撮った写真（HEIC / HEIF）を、ブラウザの中だけで JPG または PNG に一括変換するツールです。
変換処理はすべて手元のブラウザ内で完結し、**画像はどこにも送信されません**。

- インストール不要・無料（Chrome / Edge では「アプリとしてインストール」して単独ウィンドウでも使えます）
- 複数ファイルをまとめて変換
- 保存方法を選べます: ZIP でまとめて保存 ／ 一斉保存 ／ 1枚ずつ手動保存
- オフラインでも動作（一度開けば Service Worker がキャッシュします）

## 使い方

1. HEIC ファイルをドロップ（またはクリックして選択）
2. 変換フォーマット（PNG / JPG）と保存方法を選ぶ
3. 「一括変換を開始」を押す

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド（dist/）
```

`main` ブランチに push すると GitHub Actions が自動でビルドし、GitHub Pages に公開します（`.github/workflows/deploy.yml`）。

アイコンと OGP 画像は `scripts/make-icons.py`（Pillow）で生成しています。

## 技術

React + TypeScript + Vite。HEIC のデコードには [heic2any](https://github.com/alexcorvi/heic2any) を使っています。

## 作者

kishino（[@_kishino](https://x.com/_kishino)）
