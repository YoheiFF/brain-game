---
project_id: "2026-05-11-1600-mobile-security-audit"
phase: research
created: "2026-05-11"
---
# 情報収集レポート: モバイルリリース向けセキュリティ監査

## 結論サマリー

最も深刻な問題は **userId の偽装が完全に無防備** な点である。クライアントが UUID を生成して localStorage に保存し、その値をそのまま Server Action に渡すため、他人の userId を指定するだけで任意ユーザーのスコアを書き込める。次に深刻なのは **スコアの上限バリデーション未実装** で、任意の巨大値をランキングに登録できる状態にある。API 認証・Rate Limit は一切なく、/api/sync は匿名で全ユーザースコアを参照できる。一方、`server-only` インポートによる TURSO_AUTH_TOKEN のクライアント漏洩は現状防げており、SQL インジェクションもパラメータバインドで対策済みである。Capacitor の `webDir: "out"` は Next.js の静的エクスポートが有効になっていないため矛盾を抱えており、モバイル動作に支障をきたすリスクがある。CORS 設定・Rate Limit・タイムアウトは未実装のままである。

---

## 発見した問題一覧

| # | 問題 | 深刻度 | カテゴリ | 該当ファイル |
|---|------|--------|---------|------------|
| 1 | userId をクライアントが自己申告するだけで検証なし（他人スコア書き込み可） | 🔴高 | セキュリティ | `app/actions/user.ts`, `lib/nickname.ts` |
| 2 | recordScore にスコア上限バリデーションがない（任意値でランキング汚染可） | 🔴高 | セキュリティ | `app/actions/user.ts` |
| 3 | /api/sync に認証・認可が一切なく全ユーザーデータを匿名取得可能 | 🟡中 | セキュリティ | `app/api/sync/route.ts` |
| 4 | upsertUser の id フィールドが UUID 形式か検証されていない | 🟡中 | セキュリティ | `app/actions/user.ts` |
| 5 | API エンドポイントに Rate Limit がない（スパム/DoS リスク） | 🟡中 | セキュリティ | `app/api/sync/route.ts` |
| 6 | Turso クライアントにタイムアウト設定なし（接続ハング時にリクエストが詰まる） | 🟡中 | DB接続 | `lib/db.ts` |
| 7 | Capacitor `webDir: "out"` だが next.config.mjs に `output: "export"` が未設定（静的ビルドが生成されない） | 🟡中 | モバイル | `capacitor.config.ts`, `next.config.mjs` |
| 8 | nickname にニックネームの文字種バリデーション（スクリプトタグ等）がない | 🟡中 | セキュリティ | `app/actions/user.ts` |
| 9 | オフライン時に localStorage の古いスコアが DB の最新値を上書きするリスク | 🟡中 | キャッシュ | `hooks/useDbSync.ts`, `lib/scores.ts` |
| 10 | CORS ヘッダー未設定（Capacitor WebView からの API リクエストが環境依存） | 🟡中 | モバイル | `app/api/sync/route.ts` |
| 11 | DB 接続失敗時に Server Action が "db error" 文字列のみ返しフォールバックなし | 🟢低 | DB接続 | `app/actions/user.ts` |
| 12 | .gitignore に `.env.production` パターンが未記載（追加時に誤コミットリスク） | 🟢低 | セキュリティ | `.gitignore` |
| 13 | useDbSync の visibilitychange ハンドラが空関数（バックグラウンド復帰時即時再取得なし） | 🟢低 | キャッシュ | `hooks/useDbSync.ts` |

---

## 詳細分析

### セキュリティ

#### 1. userId 偽装リスク（最重要）

**確認済み事実:**
- `lib/nickname.ts` の `getOrInitUserId()` は `crypto.randomUUID()` で UUID を生成し localStorage に保存する
- `app/actions/user.ts` の `recordScore` は `input.userId` をそのまま `saveScoreToDb(input.userId, ...)` に渡す
- userId がセッション・JWT・サーバー側セッションなど何らかの認証と紐づいていない
- Server Action はクライアントから任意の `userId` 文字列を受け取れる

**問題点:**
任意の userId（他人の UUID）を指定して `recordScore` を呼べば、他人のスコアを上書きできる。ランキング・ベストスコアの改ざんが誰でも可能。Server Actions はブラウザ DevTools から直接呼び出せるため、ハードルは低い。

#### 2. スコア上限バリデーション欠如

**確認済み事実:**
```typescript
// app/actions/user.ts L61-62
if (input.score < 0) {
  return { success: false, error: "invalid score" };
}
```
`score < 0` のみチェック。上限チェックなし。

**問題点:**
`score: 999999` など非現実的な値を送信することでランキング上位を任意に占有できる。gameId ごとの現実的な最大値（例: reaction は下限方向が優秀）の検証が必要。

#### 3. /api/sync 認証不要

**確認済み事実:**
```typescript
// app/api/sync/route.ts
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get("userId");
  // UUID 形式チェックのみ、認証チェックなし
```
UUID 形式のチェックはあるが、「このユーザーからのリクエストである」検証は皆無。

**問題点:**
任意の UUID を userId に指定することで全ユーザーのランキングデータを取得可能。ランキングはパブリック情報として公開設計であれば問題ないが、`personalBests`（個人スコア）も同じエンドポイントで返している点は検討が必要。

#### 4. upsertUser の id 形式未検証

**確認済み事実:**
```typescript
// app/actions/user.ts
export async function upsertUser(input: UpsertUserInput): Promise<ActionResult> {
  if (input.nickname.trim().length === 0) { ... }
  if (input.nickname.trim().length > 12) { ... }
  if (input.age !== null && (input.age < 1 || input.age > 120)) { ... }
  // input.id の UUID 形式チェックがない
```
`/api/sync` の GET では UUID 正規表現チェックがあるが、Server Action 側にはない。

**問題点:**
任意の文字列を id として users テーブルに挿入可能。SQL インジェクション自体はパラメータバインドで防がれているが、DB の一貫性が崩れる。

#### 5. nickname 文字種バリデーション欠如

**確認済み事実:**
長さのみチェック（1〜12文字）。文字種・HTMLエスケープは未実施。

**問題点:**
`<script>alert(1)</script>` のような文字列がニックネームとして DB に保存される可能性がある。Next.js の React レンダリングは JSX で出力するため通常の XSS には至らないが（`{nickname}` はエスケープされる）、将来的にサーバーサイドレンダリングや他システムへのデータ連携時にリスクとなる。

#### 6. Rate Limit なし

`/api/sync` GET エンドポイントに呼び出し制限が一切ない。モバイルアプリから 30 秒ポーリングが走るため、悪意あるクライアントが大量リクエストを送れば Turso の無料プランクォータを枯渇させられる。

---

### DB接続・エラーハンドリング

#### server-only による誤バンドル防止

**確認済み事実:**
```typescript
// lib/db.ts L1
import "server-only";
```
`server-only` パッケージが正しくインポートされている。Android APK アセット内の JS バンドル（`android/app/src/main/assets/public/_next/static/chunks/`）に `TURSO` / `authToken` / `createClient` / `getDb` のいずれも含まれていないことをグレップで確認済み。

**評価:** 問題なし。`TURSO_AUTH_TOKEN` のクライアント漏洩は防げている。

#### タイムアウト設定

**確認済み事実:**
```typescript
// lib/db.ts
client = createClient({ url, authToken });
```
`@libsql/client` の `createClient` にタイムアウトオプションを渡していない。

**問題点:**
Turso への接続が応答しない場合、Server Action やルートハンドラが無期限にハングする可能性がある。特にモバイルのネットワーク切替時（WiFi → モバイルデータ）で問題になりやすい。

#### DB 接続失敗時のフォールバック

**確認済み事実:**
`upsertUser` / `recordScore` は catch で `{ success: false, error: "db error" }` を返す。クライアント側でこのエラーをどう処理するかは各ページの実装次第。

**問題点:**
スコア記録失敗時にローカルキャッシュへのフォールバック書き込み（`lib/scores.ts` の localStorage 書き込み）が行われるかどうか、呼び出し元の実装に依存している。一貫したオフラインキュー戦略がない。

---

### キャッシュ・オフライン

#### localStorage と DB の整合性

**確認済み事実:**
`hooks/useDbSync.ts` では DB 取得成功時に `localStorage.setItem("braingame_scores", ...)` を上書きする。DB 値が最新であればこれで正しく上書きされる。

**問題点（潜在的）:**
`lib/scores.ts` の `recordScoreAndSync` 関数（`lib/scores.ts` 内部）は、スコアをまず localStorage に書き込んでから Server Action を呼ぶ設計になっている。Server Action が失敗した場合、localStorage には記録されるが DB には記録されない「ゴースト値」が発生する。次回 `useDbSync` が成功した際に DB 値で上書きされるため一時的に解消されるが、永続化されたと誤認するリスクがある。

#### Capacitor オフライン時の fetch エラー

**確認済み事実:**
```typescript
// hooks/useDbSync.ts L60-63
} catch (e) {
  setError(e instanceof Error ? e : new Error("unknown error"));
  // エラー時は前回の data をそのまま保持
}
```
fetch 失敗時は `data` を保持し、`error` state に記録する。ユーザーに対するエラー表示の実装は呼び出し元次第。

**問題点:**
Capacitor WebView 内でオフライン状態の場合、fetch は `TypeError: Failed to fetch` を投げる。このエラーがサイレントに処理され、UI にフィードバックが出ない場合がある。

#### Cache-Control

**確認済み事実:**
```typescript
// app/api/sync/route.ts L51-53
return NextResponse.json(body, {
  headers: { "Cache-Control": "no-store" },
});
```
`Cache-Control: no-store` が正しく設定されている。問題なし。

---

### モバイル固有

#### Capacitor webDir と next.config.mjs の不整合（重要）

**確認済み事実:**
```typescript
// capacitor.config.ts
webDir: 'out',
```
```javascript
// next.config.mjs
const nextConfig = {
  images: { unoptimized: true },
  // output: "export" が存在しない
};
```
`capacitor.config.ts` は `webDir: 'out'` を指定しているが、`next.config.mjs` に `output: "export"` がない。`next build` では `out/` ディレクトリが生成されない（`.next/` のみ）。

**現状の状況:**
`android/app/src/main/assets/public/` に静的ビルドが存在している（手動コピーの可能性）。しかし `next.config.mjs` に `output: "export"` がなければ Server Actions・API Routes はビルド時に動作しないため、ビルドフローが不安定。

**問題点:**
`output: "export"` が未設定のままでは：
1. `npm run build` が `.next/` のみ生成し `out/` を生成しない
2. `npx cap sync` 実行時に `out/` が空のまま APK に古いビルドが含まれる
3. Server Actions（`app/actions/user.ts`）が静的エクスポートと根本的に非互換であり、API エンドポイント経由への置き換えが必要

#### 環境変数の APK 漏洩確認

**確認済み事実:**
`android/app/src/main/assets/public/_next/static/chunks/` 内の全 JS ファイルに対して `TURSO` / `authToken` / `createClient` / `getDb` をグレップした結果、ヒットなし。

**評価:** 問題なし。`server-only` ガードが機能している。

#### CORS 設定

**確認済み事実:**
`next.config.mjs` に CORS ヘッダー設定なし。`/api/sync/route.ts` にも `Access-Control-Allow-Origin` ヘッダーなし。

**問題点:**
Capacitor Android の WebView は `capacitor://localhost` オリジンでリクエストを送る。Next.js サーバーが Vercel 等の別オリジンにある場合、CORS エラーが発生する。ローカル環境（`localhost:3000`）と APK が同一オリジン扱いになるかは Capacitor のサーバー設定に依存するため、明示的な CORS 設定が必要。

---

## 設計者への申し送り

### 優先対応（リリースブロッカー）

1. **userId 認証の実装**
   - クライアントが自己申告した userId を信頼しない設計に変更する
   - 最低限: Server Action でセッション Cookie と userId を照合する（例: `next-auth` + DB セッション）
   - 代替案: UUID をサーバーが発行し署名付きトークンで返す

2. **スコアの上限バリデーション**
   - gameId ごとに現実的な最大値を定義し `recordScore` でチェックする
   - 例: `calculation: max 100`, `reaction: min 50ms`, `memory-number: max 20`, etc.

3. **Capacitor ビルドフローの修正**
   - Server Actions と API Routes は静的エクスポートと非互換。以下のいずれかを選択:
     - **Option A**: Next.js をサーバーモードで Vercel/VPS にデプロイし、Capacitor は `server.url` でそのサーバーを指す設定にする（Server Actions 使用可）
     - **Option B**: `output: "export"` を設定し、Server Actions を全て API Routes に置き換え、API は別サーバーに置く

### 推奨対応（セキュリティ強化）

4. **upsertUser の id UUID 形式チェック追加**
   - `app/actions/user.ts` の `upsertUser` に `/api/sync` と同じ UUID 正規表現チェックを追加

5. **nickname 文字種バリデーション**
   - 英数字・日本語・一部記号のみ許可するホワイトリスト正規表現を追加

6. **CORS 設定**
   - `next.config.mjs` に `headers()` で `/api/sync` に `Access-Control-Allow-Origin: capacitor://localhost` を追加

7. **Rate Limit**
   - `/api/sync` に IP ベースの簡易 Rate Limit を実装（例: `@upstash/ratelimit` + Redis, または Vercel Edge Middleware）

### 将来対応（品質向上）

8. **Turso タイムアウト設定**
   - `createClient` に `timeout` オプションを追加（例: 10 秒）

9. **visibilitychange 即時再取得**
   - `useDbSync.ts` の空ハンドラを `fetchData()` 呼び出しに変更し、バックグラウンドから復帰時に即時同期

10. **スコア記録失敗時のリトライキュー**
    - Server Action 失敗時にローカルキューに積み、次回オンライン時に再送する仕組みを追加
