# textmori

Tauri + SvelteKit + CodeMirror 6 で作った軽量テキストエディタ。

## 機能

- タブによる複数ファイルの編集(新規 / 開く / 保存 / 名前を付けて保存)
- 未保存変更の表示と、タブを閉じる時・アプリ終了時の確認
- 検索・置換、undo/redo、行番号、矩形選択
- 行の折り返し切り替え、フォントサイズ変更
- ステータスバー(行:列、選択文字数、行数/文字数、改行コード、文字コード)
- ウィンドウへのドラッグ&ドロップでファイルを開く
- CRLF / LF を検出し、保存時に元の改行コードを維持
- OS のテーマに追従するライト / ダーク表示

シンタックスハイライトの言語パックは持たず、プレーンテキスト編集に特化している。

## ショートカット

| キー | 動作 |
| --- | --- |
| `Ctrl+N` | 新規タブ |
| `Ctrl+O` | ファイルを開く |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 名前を付けて保存 |
| `Ctrl+W` | タブを閉じる |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 次 / 前のタブ |
| `Ctrl+F` / `Ctrl+H` | 検索 / 置換 |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | フォントサイズ 拡大 / 縮小 / 既定 |

## 開発

```sh
npm install
npm run tauri dev     # 開発用に起動
npm run tauri build   # 配布用にビルド
npm run check         # 型チェック
```

## 構成

| パス | 役割 |
| --- | --- |
| `src/lib/editor.ts` | CodeMirror の拡張構成 |
| `src/lib/workspace.svelte.ts` | タブ管理とファイル入出力 |
| `src/lib/components/` | タブバー・ステータスバー |
| `src/routes/+page.svelte` | 画面全体とショートカット・ウィンドウ連携 |
| `src-tauri/` | Tauri (Rust) 側 |

## ライセンス

MIT
