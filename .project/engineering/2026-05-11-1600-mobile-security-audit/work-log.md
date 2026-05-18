---
project_id: "2026-05-11-1600-mobile-security-audit"
phase: engineering
created: "2026-05-11"
engineer: Claude (Senior Software Engineer)
---

# 作業ログ: モバイルリリース向けセキュリティ修正

## 実施日時
2026-05-11

## 参照設計書
- 詳細設計書: `.project/design/2026-05-11-1600-mobile-security-audit/detailed-design.md`
- 基本設計書: `.project/design/2026-05-11-1600-mobile-security-audit/basic-design.md`

---

## 修正ファイル一覧

### 1. `app/actions/user.ts`

**変更内容:**
- `"use server"` ディレクティブの直後（import の後）にバリデーション定数を追加
  - `UUID_REGEX`: UUID v4 形式チェック用正規表現
  - `NICKNAME_REGEX`: Unicode 対応文字種チェック（`/u` フラグ付き）
  - `SCORE_LIMITS`: ゲームごとのスコア有効範囲 `Record<GameId, {min, max}>`
  - `MAX_PLAYS_PER_DAY = 3`: 1日あたりの最大プレイ回数
- import に `getDb` (`@/lib/db`) および `GAME_META` (`@/lib/scores`) を追加
- `upsertUser` 関数:
  - UUID 形式チェック追加（先頭で実行）
  - `trimmedNickname` 変数を使って `trim()` 呼び出しを一元化
  - 文字種チェック（`NICKNAME_REGEX`）を長さチェック後に追加
- `recordScore` 関数:
  - `gameId` チェックをスコアチェックより前に移動
  - `score < 0` チェックを `SCORE_LIMITS` による範囲チェックに置き換え（拡張）
  - try ブロック内の先頭でレート制限チェック（DB 参照）を追加

**確認事項:**
- TypeScript コンパイルエラーなし (`tsc --noEmit` 出力なし)

---

### 2. `lib/db.ts`

**変更内容:**
- `createClient` の呼び出しにカスタム `fetch` オプションを追加
- `AbortController` + `setTimeout(10_000)` で 10 秒タイムアウトを実装
- `.finally()` で `clearTimeout` を確実に実行

**確認事項:**
- 既存の `getDb()` インターフェースは変更なし
- TypeScript コンパイルエラーなし

---

### 3. `app/api/sync/route.ts`

**変更内容:**
- `ALLOWED_ORIGINS` 定数を追加 (`capacitor://localhost`, `http://localhost`)
- `getCorsHeaders(origin)` ヘルパー関数を追加
  - 許可オリジンに一致した場合そのオリジンを返す
  - 未知/null オリジンの場合はデフォルト `capacitor://localhost` を返す
- `OPTIONS` 関数（プリフライトハンドラ）を追加 → 204 + CORS ヘッダー返却
- `GET` 関数内で `origin` を取得し、レスポンスヘッダーに CORS ヘッダーを追加

**確認事項:**
- TypeScript コンパイルエラーなし

---

### 4. `capacitor.config.ts`

**変更内容:**
- `server` ブロックを追加
  - `url: 'https://REPLACE_WITH_VERCEL_URL'`（プレースホルダー）
  - `cleartext: false`（HTTP 接続を禁止）
  - コメントでデプロイ後の URL 置換を促す注記を追加

**注意事項:**
- `REPLACE_WITH_VERCEL_URL` のまま APK をビルドするとサーバーに接続できない
- Vercel デプロイ後に実際の URL（例: `https://brain-game-app.vercel.app`）に置換すること
- ローカル開発時は `url` を `http://localhost:3000` に変更するか、`server` ブロックをコメントアウトすること

---

## TypeScript 型チェック結果

```
$ npx tsc --noEmit
(出力なし = エラーなし)
```

---

## 設計書との差分・特記事項

1. **import 順序**: 設計書では定数を "use server の直後、既存 import の前" と記載されていたが、TypeScript の標準的な記述順（import → const）に従い、import をファイル先頭に配置し、定数をその後に置いた。動作に影響なし。

2. **`GAME_META` の未使用**: 設計書の import 指示に `GAME_META` が含まれているが、実装上は `SCORE_LIMITS` を独立定数として定義しているため未使用。`tsconfig.json` で `noUnusedLocals` が設定されていないため TypeScript エラーは発生しない。将来 `SCORE_LIMITS` を `GAME_META` ベースで生成する場合に備えた設計意図と解釈。

3. **`lib/db-scores.ts` の `getPlayCountFromDb` 追加**: 設計書の注意事項では "DB アクセスが必要な場合は `lib/db-scores.ts` に関数を追加して使う" と記載されていたが、詳細設計書 1.3 では `getDb()` を直接 `recordScore` 内で使用するパターンが示されていた。詳細設計書の実装仕様を優先し、`lib/db-scores.ts` への関数追加は行わなかった。

---

## 修正後のセキュリティ要件充足状況

| 要件 | 修正箇所 | 状態 |
|------|---------|------|
| REQ-01: スコア上限バリデーション | `recordScore` の `SCORE_LIMITS` チェック | 完了 |
| REQ-02: Capacitor server.url | `capacitor.config.ts` の `server` ブロック追加 | 完了 |
| REQ-03: UUID バリデーション | `upsertUser` の `UUID_REGEX` チェック | 完了 |
| REQ-04: レート制限 DB チェック | `recordScore` の `daily_plays` クエリ | 完了 |
| REQ-05: Turso タイムアウト | `lib/db.ts` のカスタム fetch | 完了 |
| REQ-06: CORS ヘッダー | `app/api/sync/route.ts` の CORS 対応 | 完了 |
| REQ-07: nickname 文字種バリデーション | `upsertUser` の `NICKNAME_REGEX` チェック | 完了 |
