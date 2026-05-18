---
project_id: "2026-05-12-1000-privacy-policy"
phase: engineering
created: "2026-05-12"
---
# 実装ログ - 2026-05-12-1000-privacy-policy

## 編集ファイル一覧

| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| `app/privacy-policy/page.tsx` | 新規作成 | ✅ | Server Component、全12セクション |
| `app/page.tsx` | 変更（追記のみ） | ✅ | フッターにプライバシーポリシーリンク追加 |
| `components/NicknameModal.tsx` | 変更（state追加・JSX追加・disabled条件変更） | ✅ | agreed state + チェックボックス + disabled条件 |

---

## ファイル別詳細

### 1. `app/privacy-policy/page.tsx`（新規作成）

- Server Component として実装（`"use client"` なし）
- `export const metadata` で SEO メタデータ付与
- 全12セクション実装:
  1. はじめに（開発者情報テーブル付き）
  2. 収集する情報（ユーザー入力情報 + AdMob 自動収集情報）
  3. 情報の利用目的
  4. 第三者へのデータ提供（Google / Turso / Vercel テーブル）
  5. 外国への個人情報の提供
  6. 広告について
  7. ユーザーの権利
  8. データの保存期間
  9. データの安全管理
  10. 子供のプライバシー
  11. プライバシーポリシーの変更
  12. お問い合わせ
- 内部ヘルパーコンポーネント（`Section`, `SubHeading`, `ExternalLink`, `TableRow`）を同一ファイルに定義
- 最終更新日: 2026年5月12日
- ダークテーマ（`#0f0f1a` 背景、`#6c63ff` アクセント）に合わせたスタイリング

### 2. `app/page.tsx`（変更）

- 既存の `Link` import を再利用（追加 import なし）
- `<p className="text-center text-[#2a2a4a] text-xs mt-10">` の直後に5行追加
- `<Link href="/privacy-policy">プライバシーポリシー</Link>` を挿入
- 既存コードへの影響: ゼロ

### 3. `components/NicknameModal.tsx`（変更）

- `import Link from "next/link";` を3行目に追加
- `const [agreed, setAgreed] = useState(false);` を `error` state の直後に追加
- `{error && ...}` の直後に同意チェックボックス JSX を追加（`mode === "setup"` 時のみ表示）
- ボタンの `disabled` 条件を変更:
  - 変更前: `value.trim().length === 0`
  - 変更後: `value.trim().length === 0 || (mode === "setup" && !agreed)`
- `handleSubmit` 関数への変更なし

---

## 全体サマリー

### 実装完了日時
2026-05-12

### 実装内容
詳細設計書（`2026-05-12-1000-privacy-policy/detailed-design.md`）に従い、以下を実装した。

1. **プライバシーポリシーページ新規作成**: Google Play 必須要件・日本個人情報保護法・AdMob ポリシーに準拠した `/privacy-policy` ページを Server Component として実装。本番品質の全12セクションを含む。

2. **タイトル画面フッターリンク追加**: `app/page.tsx` の最下部に「プライバシーポリシー」テキストリンクを追加。既存コードへの影響ゼロ。

3. **NicknameModal 同意チェックボックス追加**: 初回セットアップ（`mode="setup"`）時に「プライバシーポリシーに同意する」チェックボックスを追加。未同意では「はじめる！」ボタンを無効化。Google Play の「認識しやすい開示と同意」要件に対応。

### 特記事項
- 追加パッケージなし（標準 Next.js / React のみ）
- TypeScript 型安全性を維持
- 既存のダークテーマ（Tailwind CSS）に統一
- `app/page.tsx` の `Link` import は既存のものを再利用（行2に既存）

### 完了条件チェックリスト確認
- [x] `app/privacy-policy/page.tsx` が新規作成されている
- [x] 全12セクションが含まれる
- [x] Google AdMob の自動収集データが明示されている
- [x] Turso・Vercel・Google LLC への提供が明示されている
- [x] ユーザーの権利（削除リクエスト: yoheifuse.0818@gmail.com）が記載されている
- [x] 子供のプライバシー（13歳未満対象外）が記載されている
- [x] 最終更新日: 2026年5月12日が記載されている
- [x] `app/page.tsx` のフッターに「プライバシーポリシー」リンクが追加されている
- [x] `components/NicknameModal.tsx` に `agreed` state が追加されている
- [x] NicknameModal（`mode="setup"`）に同意チェックボックスが表示される
- [x] チェックなし時に「はじめる！」ボタンが `disabled` になる
- [x] チェックボックスの「プライバシーポリシー」リンクが新しいタブで開く（`target="_blank"`）
- [x] NicknameModal（`mode="change"`）でチェックボックスが非表示である
