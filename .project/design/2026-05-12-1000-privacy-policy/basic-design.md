---
project_id: "2026-05-12-1000-privacy-policy"
phase: design / basic
created: "2026-05-12"
---

# 基本設計書: プライバシーポリシー実装

## 1. システム構成概要

本実装は Next.js（App Router）で構築された既存の BrainGame Web アプリに対して、
3箇所の変更・追加を行う。外部サービスへの新規接続は発生しない。

```
BrainGame (Next.js / Vercel)
├── app/
│   ├── page.tsx               [変更] フッターにリンク追加
│   ├── privacy-policy/
│   │   └── page.tsx           [新規] プライバシーポリシーページ
│   └── globals.css            [参照のみ・変更なし]
└── components/
    └── NicknameModal.tsx      [変更] 同意チェックボックス追加
```

---

## 2. 画面設計

### 2-1. プライバシーポリシーページ（`/privacy-policy`）

**レイアウト方針**

- 最大幅 `max-w-2xl`、中央寄せ、パディング `px-4 py-10`（既存ページと統一）
- 背景: `#0f0f1a`（body デフォルト）
- ページ全体を1枚の `.card`（`bg-[#1a1a2e]` + `border-[#2a2a4a]` + `rounded-2xl`）でラップ
- h1 のフォントサイズ: `text-2xl font-black text-white`
- h2（各セクション見出し）: `text-lg font-bold text-[#6c63ff] mt-6 mb-2`
- 本文テキスト: `text-[#94a3b8] text-sm leading-relaxed`
- 外部リンク: `text-[#6c63ff] underline hover:text-purple-400` + `target="_blank" rel="noopener noreferrer"`
- ページ最上部: `← ホームへ戻る` リンク（`<Link href="/">`）
- ページ最下部: 最終更新日テキスト

**セクション構成（表示順）**

```
1. [タイトル] プライバシーポリシー
2. [戻るリンク] ← ホームへ戻る
3. はじめに
4. 収集する情報
   4-1. ユーザーが入力する情報
   4-2. 自動的に収集される情報（AdMob）
5. 情報の利用目的
6. 第三者へのデータ提供
7. 外国への個人情報の提供
8. 広告について
9. ユーザーの権利
10. データの保存期間
11. データの安全管理
12. 子供のプライバシー
13. プライバシーポリシーの変更
14. お問い合わせ
15. [フッター] 最終更新日: 2026年5月12日
```

**SEO メタデータ（`export const metadata`）**

```typescript
export const metadata: Metadata = {
  title: "プライバシーポリシー | BrainGame",
  description: "BrainGame のプライバシーポリシーです。収集するデータ・利用目的・第三者提供について説明します。",
};
```

---

### 2-2. タイトル画面フッター変更（`app/page.tsx`）

**変更前（既存）**

```tsx
<p className="text-center text-[#2a2a4a] text-xs mt-10">
  {syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"}
</p>
```

**変更後**

既存の `<p>` タグの直後に新しい `<p>` タグを追加する。
既存タグは一切変更しない。

```tsx
<p className="text-center text-[#2a2a4a] text-xs mt-10">
  {syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"}
</p>
<p className="text-center mt-2">
  <Link href="/privacy-policy" className="text-[#2a2a4a] text-xs hover:text-[#64748b] transition-colors">
    プライバシーポリシー
  </Link>
</p>
```

---

### 2-3. NicknameModal 同意チェックボックス（`components/NicknameModal.tsx`）

**追加 state**

```typescript
const [agreed, setAgreed] = useState(false);
```

**チェックボックス UI の配置位置**

`{error && ...}` の `<p>` タグの直下、`<div className="flex gap-3 w-full">` の直上に挿入。

```tsx
{mode === "setup" && (
  <label className="flex items-start gap-2 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={agreed}
      onChange={(e) => setAgreed(e.target.checked)}
      className="mt-0.5 accent-[#6c63ff] cursor-pointer"
    />
    <span className="text-[#64748b] text-xs leading-relaxed">
      <Link
        href="/privacy-policy"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#6c63ff] underline hover:text-purple-400"
      >
        プライバシーポリシー
      </Link>
      に同意する
    </span>
  </label>
)}
```

**ボタン無効化ロジック**

`mode === "setup"` のボタン `disabled` 条件に `!agreed` を追加する。

```tsx
disabled={value.trim().length === 0 || (mode === "setup" && !agreed)}
```

---

## 3. データフロー

本実装に新規データフローはない。
プライバシーポリシーページは静的コンテンツのみで構成され、サーバー・DB への問い合わせは発生しない。
NicknameModal の同意チェックボックスは UI 状態管理のみ（React state）。同意フラグの永続化は行わない。

---

## 4. ルーティング設計

| パス | コンポーネント | レンダリング方式 |
|---|---|---|
| `/` | `app/page.tsx` | CSR（既存 `"use client"`） |
| `/privacy-policy` | `app/privacy-policy/page.tsx` | SSG（`"use client"` 不要） |

`/privacy-policy` は Server Component として実装し、`export const metadata` でメタデータを静的に設定する。

---

## 5. 影響範囲

| ファイル | 変更種別 | 変更内容の概要 |
|---|---|---|
| `app/privacy-policy/page.tsx` | 新規作成 | プライバシーポリシーの全文をコンテンツとして持つ静的ページ |
| `app/page.tsx` | 変更（追記） | フッターに `<Link>` を1つ追加（既存 `<p>` タグへの影響なし） |
| `components/NicknameModal.tsx` | 変更（追記） | `agreed` state 追加・チェックボックス JSX 追加・ボタン `disabled` 条件変更 |

**変更しないファイル**

- `app/globals.css`（新規 CSS クラス追加不要）
- `app/layout.tsx`（メタデータはページレベルで設定）
- その他全ファイル

---

## 6. 依存関係

- `next/link`（`<Link>`）: 既存インポート済み（`app/page.tsx`）。`NicknameModal.tsx` に新規 import が必要
- `next`: `Metadata` 型を `app/privacy-policy/page.tsx` で使用
- 追加 npm パッケージ: なし

---

## 7. リスク・注意事項

| リスク | 対策 |
|---|---|
| NicknameModal の `mode="change"` で同意チェックが表示されると既存ユーザーが困る | `mode === "setup"` 時のみ表示・無効化ロジックを適用 |
| プライバシーポリシーの法的内容の不足 | 情報収集レポートに記載の必須セクションを全て含める。Turso社名（ChiselStrike, Inc.）を正確に記載 |
| `/privacy-policy` が Server Component なのに `"use client"` を付与してしまう | メタデータ export が必要なため Server Component として実装する。`useState` 等は使用しない |
