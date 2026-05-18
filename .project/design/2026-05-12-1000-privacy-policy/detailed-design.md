---
project_id: "2026-05-12-1000-privacy-policy"
phase: design / detailed
created: "2026-05-12"
---

# 詳細設計書: プライバシーポリシー実装

## 1. 概要

本プロジェクトで実現されること:

- **新規ファイル `app/privacy-policy/page.tsx`**: Google Play 必須要件・日本個人情報保護法・AdMob ポリシーに準拠したプライバシーポリシーページを `/privacy-policy` で公開する。Server Component として実装し SEO メタデータを付与する。
- **変更 `app/page.tsx`**: タイトル画面最下部に「プライバシーポリシー」テキストリンクを追加し、アプリ内からのアクセス経路を確保する。
- **変更 `components/NicknameModal.tsx`**: 初回プロフィール設定時（`mode="setup"`）に「プライバシーポリシーに同意する」チェックボックスを追加し、未同意では「はじめる！」ボタンを無効化する。Google Play の「認識しやすい開示と同意」要件に対応する。

---

## 2. 影響範囲（ファイル一覧）

| ファイルパス | 変更種別 |
|---|---|
| `app/privacy-policy/page.tsx` | 新規作成 |
| `app/page.tsx` | 変更（追記のみ） |
| `components/NicknameModal.tsx` | 変更（state 追加・JSX 追加・disabled 条件変更） |

---

## 3. ファイル別変更詳細

---

### 3-1. `app/privacy-policy/page.tsx`（新規作成）

#### 3-1-1. ファイル全体

```tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | BrainGame",
  description:
    "BrainGame のプライバシーポリシーです。収集するデータ・利用目的・第三者提供について説明します。",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <div className="card p-6 sm:p-8 flex flex-col gap-2">

        {/* 戻るリンク */}
        <Link
          href="/"
          className="text-[#6c63ff] text-sm hover:text-purple-400 transition-colors mb-2 inline-block"
        >
          ← ホームへ戻る
        </Link>

        {/* タイトル */}
        <h1 className="text-2xl font-black text-white mb-2">プライバシーポリシー</h1>
        <p className="text-[#64748b] text-xs mb-4">最終更新日: 2026年5月12日</p>

        {/* 1. はじめに */}
        <Section title="はじめに">
          <p>
            本プライバシーポリシーは、個人開発者（以下「開発者」）が提供する脳トレアプリ「BrainGame」（以下「本アプリ」）における、ユーザーの個人情報の取り扱いについて説明します。
          </p>
          <p>
            本アプリを利用することで、本ポリシーに記載された内容に同意したものとみなします。
          </p>
          <table className="w-full text-xs mt-3 border-collapse">
            <tbody>
              <TableRow label="アプリ名" value="BrainGame" />
              <TableRow label="開発者" value="個人開発者" />
              <TableRow label="連絡先" value="yoheifuse.0818@gmail.com" />
              <TableRow label="ホスティング" value="Vercel (brain-game-opal.vercel.app)" />
            </tbody>
          </table>
        </Section>

        {/* 2. 収集する情報 */}
        <Section title="収集する情報">
          <SubHeading>ユーザーが入力する情報</SubHeading>
          <ul className="list-disc list-inside space-y-1">
            <li>ニックネーム（最大12文字、任意入力）</li>
            <li>年齢（任意入力）</li>
            <li>ゲームスコア（各ゲームのベスト記録）</li>
            <li>プレイ回数・日別プレイ履歴</li>
            <li>ユーザーID（端末内でランダム生成される UUID。ユーザーが直接入力するものではありません）</li>
          </ul>
          <p className="mt-2">
            これらの情報は端末の localStorage および Turso（クラウドデータベース）に保存されます。
            ニックネームとスコアはランキング機能で他のユーザーに公開されます。
          </p>

          <SubHeading>自動的に収集される情報（Google AdMob）</SubHeading>
          <p>
            本アプリは広告配信のために Google AdMob（Google LLC）を使用しています。
            AdMob SDK は以下の情報を自動的に収集します。
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>広告識別子（Android Advertising ID）</li>
            <li>IPアドレス（位置情報の推定に使用）</li>
            <li>ユーザー操作情報（アプリ起動・タップ・動画視聴ログ）</li>
            <li>デバイス診断情報（パフォーマンス・クラッシュログ）</li>
            <li>デバイス識別子・アプリセット ID</li>
          </ul>
          <p className="mt-2">
            これらのデータの収集・利用は Google のプライバシーポリシーに従います。
            詳細は{" "}
            <ExternalLink href="https://policies.google.com/privacy">
              https://policies.google.com/privacy
            </ExternalLink>{" "}
            をご確認ください。
          </p>
        </Section>

        {/* 3. 情報の利用目的 */}
        <Section title="情報の利用目的">
          <ul className="list-disc list-inside space-y-1">
            <li>ゲーム機能の提供（スコア記録・ランキング表示・ベンチマーク比較）</li>
            <li>1日あたりのプレイ回数制限の管理</li>
            <li>年齢別の平均スコアとの比較機能</li>
            <li>広告の配信・広告パフォーマンスの測定（AdMob 経由）</li>
            <li>アプリの品質改善・不具合対応</li>
          </ul>
        </Section>

        {/* 4. 第三者へのデータ提供 */}
        <Section title="第三者へのデータ提供">
          <p>
            開発者は以下の第三者にユーザーデータを提供または処理委託しています。
            それ以外の第三者へのデータ販売・提供は行いません。
          </p>
          <table className="w-full text-xs mt-3 border-collapse">
            <thead>
              <tr className="border-b border-[#2a2a4a]">
                <th className="text-left py-2 pr-3 text-[#64748b] font-bold">提供先</th>
                <th className="text-left py-2 pr-3 text-[#64748b] font-bold">目的</th>
                <th className="text-left py-2 text-[#64748b] font-bold">プライバシーポリシー</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#2a2a4a]">
                <td className="py-2 pr-3 text-[#94a3b8]">Google LLC (AdMob)</td>
                <td className="py-2 pr-3 text-[#94a3b8]">広告配信・分析</td>
                <td className="py-2 text-[#94a3b8]">
                  <ExternalLink href="https://policies.google.com/privacy">Google ポリシー</ExternalLink>
                </td>
              </tr>
              <tr className="border-b border-[#2a2a4a]">
                <td className="py-2 pr-3 text-[#94a3b8]">ChiselStrike, Inc. (Turso)</td>
                <td className="py-2 pr-3 text-[#94a3b8]">データベース処理委託</td>
                <td className="py-2 text-[#94a3b8]">
                  <ExternalLink href="https://turso.tech/privacy-policy">Turso ポリシー</ExternalLink>
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-[#94a3b8]">Vercel, Inc.</td>
                <td className="py-2 pr-3 text-[#94a3b8]">Webアプリホスティング</td>
                <td className="py-2 text-[#94a3b8]">
                  <ExternalLink href="https://vercel.com/legal/privacy-policy">Vercel ポリシー</ExternalLink>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* 5. 外国への個人情報の提供 */}
        <Section title="外国への個人情報の提供">
          <p>
            上記の第三者（Google LLC・ChiselStrike, Inc.・Vercel, Inc.）はいずれも米国法人であり、
            ユーザーの個人情報は米国に所在するサーバーで処理・保存される場合があります。
          </p>
          <p className="mt-2">
            個人情報保護法第28条に基づき、各社は適切なデータ保護措置を講じています。
            詳細は各社のプライバシーポリシーをご参照ください。
          </p>
        </Section>

        {/* 6. 広告について */}
        <Section title="広告について">
          <p>
            本アプリは Google AdMob を通じて広告を配信しています。
            Google は広告 ID や人口統計カテゴリを使用して、
            ユーザーの興味・関心に基づくパーソナライズ広告を配信することがあります。
          </p>
          <p className="mt-2">
            パーソナライズ広告をオプトアウトするには、お使いの Android 端末の「設定」→「Google」→「広告」から
            「広告のパーソナライズを無効にする」を選択してください。
            また、{" "}
            <ExternalLink href="https://adssettings.google.com/">
              Google 広告設定
            </ExternalLink>{" "}
            からも管理が可能です。
          </p>
          <p className="mt-2">
            広告配信の結果として、サードパーティがクッキーやデバイス識別子を設置することがあります。
          </p>
        </Section>

        {/* 7. ユーザーの権利 */}
        <Section title="ユーザーの権利">
          <p>
            ユーザーは開発者に対して、保有する個人情報の開示・訂正・削除・利用停止を請求することができます。
          </p>
          <p className="mt-2">
            請求・お問い合わせはメールにて受け付けています:
          </p>
          <p className="mt-1 font-bold text-white">
            yoheifuse.0818@gmail.com
          </p>
          <p className="mt-2">
            アカウントの削除（ユーザーID・スコア・プロフィール情報の全削除）をご希望の場合も、
            上記メールアドレスにご連絡ください。合理的な期間内に対応いたします。
          </p>
        </Section>

        {/* 8. データの保存期間 */}
        <Section title="データの保存期間">
          <ul className="list-disc list-inside space-y-1">
            <li>ユーザープロフィール・スコア: ユーザーからの削除リクエストがあるまで保持</li>
            <li>日別プレイ履歴: 直近14日分を保持</li>
            <li>AdMob が収集するデータ: Google のポリシーに従う</li>
          </ul>
        </Section>

        {/* 9. データの安全管理 */}
        <Section title="データの安全管理">
          <ul className="list-disc list-inside space-y-1">
            <li>通信はすべて HTTPS / TLS により暗号化されています</li>
            <li>Turso データベースへのアクセスは環境変数で管理されたトークンにより制限されています</li>
            <li>AdMob との通信はすべて TLS により暗号化されています</li>
          </ul>
        </Section>

        {/* 10. 子供のプライバシー */}
        <Section title="子供のプライバシー">
          <p>
            本アプリは13歳未満の方を対象としていません。
            13歳未満の方の個人情報を意図的に収集することはありません。
            13歳未満の方が本アプリを利用していることが判明した場合、
            当該情報を速やかに削除いたします。
          </p>
        </Section>

        {/* 11. プライバシーポリシーの変更 */}
        <Section title="プライバシーポリシーの変更">
          <p>
            本ポリシーは必要に応じて改定されることがあります。
            重要な変更がある場合は、アプリのアップデート情報または本ページにて通知します。
            最終更新日を必ずご確認ください。
          </p>
        </Section>

        {/* 12. お問い合わせ */}
        <Section title="お問い合わせ">
          <p>本ポリシーに関するご質問・ご意見は以下までお問い合わせください。</p>
          <p className="mt-1 font-bold text-white">yoheifuse.0818@gmail.com</p>
          <p className="mt-3 text-xs text-[#64748b]">
            個人情報の取り扱いに関する苦情は、個人情報保護委員会（
            <ExternalLink href="https://www.ppc.go.jp/">https://www.ppc.go.jp/</ExternalLink>
            ）に申し出ることもできます。
          </p>
        </Section>

        {/* フッター */}
        <p className="text-[#2a2a4a] text-xs mt-6 text-right">最終更新日: 2026年5月12日</p>
      </div>
    </main>
  );
}

/* ---- 内部ヘルパーコンポーネント ---- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold text-[#6c63ff] mb-2 border-b border-[#2a2a4a] pb-1">
        {title}
      </h2>
      <div className="text-[#94a3b8] text-sm leading-relaxed flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-white font-bold text-sm mt-2 mb-1">{children}</h3>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#6c63ff] underline hover:text-purple-400 transition-colors"
    >
      {children}
    </a>
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[#2a2a4a]">
      <td className="py-1.5 pr-4 text-[#64748b] font-bold w-28">{label}</td>
      <td className="py-1.5 text-[#94a3b8]">{value}</td>
    </tr>
  );
}
```

#### 3-1-2. 実装上の注意点

- ファイルの先頭に `"use client"` を付与してはいけない（Server Component）
- `export const metadata` は Server Component でのみ有効
- 内部ヘルパー（`Section`, `SubHeading`, `ExternalLink`, `TableRow`）は同一ファイルに定義し、外部 export しない
- `<a>` タグを外部リンクに使用（`<Link>` は内部ルーティング用のため不適切）

---

### 3-2. `app/page.tsx`（変更）

#### 3-2-1. 変更前の関連箇所（`app/page.tsx` 末尾）

```tsx
      <p className="text-center text-[#2a2a4a] text-xs mt-10">
        {syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"}
      </p>
    </main>
```

現在のファイル末尾は `</main>` の直前に上記 `<p>` タグがある（行 207〜210）。

#### 3-2-2. 変更後の期待形

```tsx
      <p className="text-center text-[#2a2a4a] text-xs mt-10">
        {syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"}
      </p>
      <p className="text-center mt-2">
        <Link href="/privacy-policy" className="text-[#2a2a4a] text-xs hover:text-[#64748b] transition-colors">
          プライバシーポリシー
        </Link>
      </p>
    </main>
```

#### 3-2-3. 変更箇所の詳細

- **追加行数**: 5行
- **変更の種類**: 既存 `<p>` タグの直後に新しい `<p>` タグを1つ挿入するだけ
- **既存コードへの影響**: ゼロ（既存タグの属性・内容を一切変更しない）
- **import 追加**: 不要（`Link` は行1で既に import 済み）

---

### 3-3. `components/NicknameModal.tsx`（変更）

#### 3-3-1. 変更前の関連箇所

**インポート文（現行: 行1〜4）**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { getNickname, setNickname, getAge, setAge, getOrInitUserId } from "@/lib/nickname";
import { upsertUser } from "@/app/actions/user";
```

**state 宣言（現行: 行12〜15）**

```tsx
export default function NicknameModal({ onClose, mode = "setup" }: Props) {
  const [value, setValue] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
```

**エラー表示と送信ボタン周辺（現行: 行99〜118）**

```tsx
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        </div>

        <div className="flex gap-3 w-full">
          {mode === "change" && (
            <button
              onClick={() => onClose(getNickname() ?? "")}
              className="btn-secondary flex-1"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={value.trim().length === 0}
            className="btn-primary flex-1 disabled:opacity-40"
          >
            {mode === "setup" ? "はじめる！" : "変更する"}
          </button>
        </div>
```

#### 3-3-2. 変更後の期待形

**インポート文（変更後）**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getNickname, setNickname, getAge, setAge, getOrInitUserId } from "@/lib/nickname";
import { upsertUser } from "@/app/actions/user";
```

変更点: `import Link from "next/link";` を3行目に追加。

**state 宣言（変更後）**

```tsx
export default function NicknameModal({ onClose, mode = "setup" }: Props) {
  const [value, setValue] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
```

変更点: `const [agreed, setAgreed] = useState(false);` を `error` の直後に追加。

**エラー表示と送信ボタン周辺（変更後）**

```tsx
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

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
        </div>

        <div className="flex gap-3 w-full">
          {mode === "change" && (
            <button
              onClick={() => onClose(getNickname() ?? "")}
              className="btn-secondary flex-1"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={value.trim().length === 0 || (mode === "setup" && !agreed)}
            className="btn-primary flex-1 disabled:opacity-40"
          >
            {mode === "setup" ? "はじめる！" : "変更する"}
          </button>
        </div>
```

#### 3-3-3. 変更箇所の差分サマリー

| 変更種別 | 場所 | 内容 |
|---|---|---|
| import 追加 | 3行目 | `import Link from "next/link";` |
| state 追加 | コンポーネント内 state 宣言部 | `const [agreed, setAgreed] = useState(false);` |
| JSX 追加 | `{error && ...}` の直後 | 同意チェックボックス（`mode === "setup"` 時のみ表示） |
| disabled 条件変更 | `<button onClick={handleSubmit}>` | `disabled={value.trim().length === 0 || (mode === "setup" && !agreed)}` |

#### 3-3-4. 処理ロジック詳細

```
[agreed の初期化]
  useState(false) → 常に未チェック状態からスタート
  mode="change" で再開いた場合も未チェックだが、チェックボックス自体が非表示のため問題なし

[チェックボックス表示条件]
  mode === "setup" の場合のみ <label> + <input type="checkbox"> を表示
  mode === "change" の場合は何も表示しない

[ボタン disabled 条件]
  既存: value.trim().length === 0
  変更後: value.trim().length === 0 || (mode === "setup" && !agreed)
  
  つまり:
    mode="setup" の場合: ニックネーム未入力 OR 未同意 → disabled
    mode="change" の場合: ニックネーム未入力 → disabled（既存動作と同一）

[handleSubmit への影響]
  なし。handleSubmit は変更しない。
  disabled によりボタン押下自体が不可能になるため、handleSubmit 内での agreed チェックは不要。
```

---

## 4. データ構造定義

本実装で新規追加される型・インターフェース:

```typescript
// NicknameModal.tsx 内部 state のみ
const [agreed, setAgreed] = useState<boolean>(false);
// boolean 型。永続化なし（localStorage / DB への保存なし）
```

プライバシーポリシーページはデータ構造を持たない純粋な静的コンテンツ。

---

## 5. エラー処理方針

| ケース | 処理方針 |
|---|---|
| プライバシーポリシーページへのアクセス失敗（ネットワーク断等） | Next.js のデフォルトエラーハンドリングに委任。静的ページのため実質的にエラーは発生しない |
| NicknameModal でチェックなしにフォーム送信を試みる | `disabled` 属性でボタン操作を物理的にブロックするため、handleSubmit は呼ばれない |
| プライバシーポリシーリンク（新しいタブ）が開かない | `target="_blank"` のブロックはブラウザ側の問題。アプリ側での対処は不要 |

---

## 6. テスト観点

### 正常系

| # | 操作 | 期待結果 |
|---|---|---|
| T-1 | `/privacy-policy` に直接アクセスする | プライバシーポリシーページが表示される。全セクションが含まれる |
| T-2 | プライバシーポリシーページ上部の「← ホームへ戻る」をクリック | `/` に遷移する |
| T-3 | タイトル画面（`/`）下部の「プライバシーポリシー」リンクをクリック | `/privacy-policy` に遷移する |
| T-4 | NicknameModal（`mode="setup"`）を開く | 「プライバシーポリシーに同意する」チェックボックスが表示される |
| T-5 | NicknameModal でチェックなし、ニックネーム入力あり | 「はじめる！」ボタンが `disabled`（視覚的に薄い） |
| T-6 | NicknameModal でチェックあり、ニックネーム入力あり | 「はじめる！」ボタンが活性化し、クリック可能 |
| T-7 | NicknameModal の「プライバシーポリシー」テキストをクリック | 新しいタブで `/privacy-policy` が開く |
| T-8 | NicknameModal でチェックし「はじめる！」を押す | モーダルが閉じて通常フローに移行する（既存動作と同一） |
| T-9 | NicknameModal（`mode="change"`）を開く | チェックボックスが表示されない |
| T-10 | NicknameModal（`mode="change"`）でニックネーム入力あり | 「変更する」ボタンが活性化する（agreed 条件を見ない） |

### 異常系

| # | 操作 | 期待結果 |
|---|---|---|
| T-11 | NicknameModal でニックネーム未入力・チェックあり | 「はじめる！」ボタンが `disabled`（ニックネーム必須条件） |
| T-12 | NicknameModal でニックネーム未入力・チェックなし | 「はじめる！」ボタンが `disabled` |

### 境界値

| # | 操作 | 期待結果 |
|---|---|---|
| T-13 | NicknameModal でニックネーム1文字入力・チェックなし | ボタン `disabled` |
| T-14 | NicknameModal でニックネーム1文字入力・チェックあり | ボタン活性化 |
| T-15 | プライバシーポリシーページを幅320pxで表示 | レイアウト崩れなし。テーブルが横スクロール可能か本文が折り返される |

### ビルド確認

| # | 確認内容 | 期待結果 |
|---|---|---|
| T-16 | `next build` 実行 | エラー0件、警告0件（型エラーなし） |
| T-17 | `npx tsc --noEmit` 実行 | TypeScript エラー 0件 |

---

## 7. 完了条件チェックリスト

実装完了の判定基準（全項目が満たされること）:

- [ ] `app/privacy-policy/page.tsx` が新規作成されている
- [ ] `/privacy-policy` にアクセスするとプライバシーポリシーページが表示される
- [ ] ページに「はじめに」「収集する情報」「第三者へのデータ提供」など全12セクションが含まれる
- [ ] Google AdMob の自動収集データが明示されている
- [ ] Turso（ChiselStrike, Inc.）・Vercel・Google LLC への提供が明示されている
- [ ] ユーザーの権利（削除リクエスト: yoheifuse.0818@gmail.com）が記載されている
- [ ] 子供のプライバシー（13歳未満対象外）が記載されている
- [ ] 最終更新日: 2026年5月12日が記載されている
- [ ] `app/page.tsx` のフッターに「プライバシーポリシー」リンクが追加されている
- [ ] タイトル画面からのリンクが `/privacy-policy` に正しく遷移する
- [ ] `components/NicknameModal.tsx` に `agreed` state が追加されている
- [ ] NicknameModal（`mode="setup"`）に同意チェックボックスが表示される
- [ ] チェックなし時に「はじめる！」ボタンが `disabled` になる
- [ ] チェックボックスの「プライバシーポリシー」リンクが新しいタブで開く
- [ ] NicknameModal（`mode="change"`）でチェックボックスが非表示である
- [ ] `next build` がエラーなく完了する
- [ ] TypeScript の型エラーがない
