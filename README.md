# 画像変幻コンバーター

**画像形式、変幻自在。**

iPhone で撮った写真（HEIC / HEIF）や JPG・PNG・WebP・GIF・BMP を、ブラウザの中だけで PNG・JPG・WebP・GIF に一括変換するツールです。
変換処理はすべて手元のブラウザ内で完結し、**画像はどこにも送信されません**。

- インストール不要・無料（Chrome / Edge では「アプリとしてインストール」して単独ウィンドウでも使えます）
- 読み込める形式: HEIC / HEIF / JPG / PNG / WebP / GIF / BMP / AVIF（ブラウザが対応していれば）
- 書き出せる形式:
  - PNG（フルカラーの PNG-24、または 256 / 128 / 64 / 32 / 16 色に減色した PNG-8）
  - JPG
  - WebP
  - GIF（256 / 128 / 64 / 32 / 16 / 8 色に減色。透過できます）
- 複数ファイルをまとめて変換
- 保存方法を選べます: ZIP でまとめて保存 ／ 一斉保存 ／ 1枚ずつ手動保存
- オフラインでも動作（一度開けば Service Worker がキャッシュします）

## 使い方

1. 画像ファイルをドロップ（またはクリックして選択）
2. 変換フォーマットと色数、保存方法を選ぶ
3. 「一括変換を開始」を押す

## Windows版（ワンクリックインストーラー）

`v1.2.3` のようなタグを push すると GitHub Actions が Windows 用の .exe を作り、GitHub Releases に添付します（`.github/workflows/windows-app.yml`）。
ダウンロードしてダブルクリックすると、そのまま展開・起動し、スタートメニューとデスクトップにショートカットができます。
コード署名はしていないため、初回は SmartScreen の警告が出ます（「詳細情報」→「実行」で続行できます）。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド（dist/）
npm run icons    # HC_icon.png から各サイズのアイコン・OGP画像・ico を再生成
```

`main` ブランチに push すると GitHub Actions が自動でビルドし、GitHub Pages に公開します（`.github/workflows/deploy.yml`）。

## 技術

React + TypeScript + Vite。
HEIC のデコードは [heic2any](https://github.com/alexcorvi/heic2any)、それ以外の読み込みと JPG / WebP / PNG-24 の書き出しはブラウザ標準の Canvas、PNG-8 の減色は [UPNG.js](https://github.com/photopea/UPNG.js)、GIF の減色と書き出しは [gifenc](https://github.com/mattdesl/gifenc) を使っています。
アイコンの原本は `HC_icon.png`（kishino 作）で、`scripts/make-icons.py`（Pillow）が各サイズを生成します。

## 作者

kishino（[@_kishino](https://x.com/_kishino)）
