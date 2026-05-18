---
project_id: "2026-05-11-1600-mobile-security-audit"
phase: design
doc_type: requirements
created: "2026-05-11"
---

# 要件定義書: モバイルリリース向けセキュリティ修正

## 1. 背景・目的

BrainGame はニックネームのみで遊べる脳トレゲームアプリである。
ユーザー登録なし・ランキング参加型の UX を維持しつつ、
セキュリティ監査（2026-05-11）で発見された脆弱性を修正し、
モバイル（Capacitor Android）リリースに向けて品質を担保する。

## 2. スコープ

### 対象（IN）
- スコア上限バリデーション（Server Action 側）
- UUID バリデーション（upsertUser の id フィールド）
- スコア書き込みのレート制限（DB 検証）
- Turso クライアントタイムアウト
- CORS ヘッダー（/api/sync）
- nickname 文字種バリデーション
- Capacitor webDir 問題の解消（server.url 方式への切り替え）

### 対象外（OUT）
- userId 認証（Cookie/JWT セッション）: 今フェーズでは対象外
  - 理由: ニックネームのみ登録という UX を大きく変える可能性があり、別チケットで検討
- /api/sync 認証・認可
- オフラインキューの実装
- visibilitychange 即時再取得

## 3. 要件一覧

### REQ-01: スコア上限バリデーション（P1 - リリースブロッカー）

| 項目 | 内容 |
|------|------|
| 機能要件 | `recordScore` Server Action において、gameId ごとに定義された上限値を超えるスコアを reject する |
| 入力 | `gameId: GameId`, `score: number` |
| 正常系 | スコアが上限以下であれば従来通り DB に保存 |
| 異常系 | スコアが上限超過の場合、`{ success: false, error: "score out of range" }` を返す |
| 上限値 | 下表「gameId 別スコア上限値」参照 |
| 非機能要件 | バリデーションは Server Action 内（サーバー側）で行う。クライアント側バリデーションは補助扱い |

**gameId 別スコア上限値**

| gameId | lowerIsBetter | 上限値 | 下限値 | 根拠 |
|--------|:---:|--------|--------|------|
| calculation | false | 60 問 | 0 | 60 秒間で 60 問は現実的最大（1 問 1 秒） |
| memory-number | false | 20 桁 | 0 | 人間の記憶限界を超える値（世界記録級） |
| stroop | false | 60 個 | 0 | 60 秒間で 60 個は現実的最大 |
| reaction | true | 2000 ms | 50 ms | 50ms 未満は物理的に不可能、2000ms は上限として拒絶 |
| pattern | false | 25 個 | 0 | 5×5 グリッドを最大想定（現 UI は 4×4） |

### REQ-02: Capacitor webDir 問題の解消（P1 - リリースブロッカー）

| 項目 | 内容 |
|------|------|
| 機能要件 | Capacitor WebView が Vercel デプロイ済みの Next.js サーバーをロードする構成に切り替える |
| 方式 | `capacitor.config.ts` に `server.url` を設定し、ローカル `webDir` を参照しない |
| 効果 | Server Actions・API Routes が静的エクスポートなしで動作する |
| 制約 | `server.url` のプレースホルダーとして `https://REPLACE_WITH_VERCEL_URL` を記載。デプロイ URL 確定後に置換する |
| 非機能要件 | `next.config.mjs` に `output: "export"` を追加しない（サーバーモード維持） |

### REQ-03: UUID バリデーション追加（P2）

| 項目 | 内容 |
|------|------|
| 機能要件 | `upsertUser` の `input.id` が RFC 4122 UUID 形式でなければ reject |
| 正規表現 | `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` |
| 異常系 | `{ success: false, error: "invalid userId format" }` を返す |
| 備考 | `recordScore` 側・`/api/sync` 側は既に実装済み。`upsertUser` に同一チェックを追加する |

### REQ-04: スコア書き込みのレート制限（P2）

| 項目 | 内容 |
|------|------|
| 機能要件 | `recordScore` 呼び出し時、当日の `daily_plays` テーブルを参照し、同一 gameId の `play_count` が `MAX_PLAYS_PER_DAY`（=3）以上であれば reject |
| 定数 | `MAX_PLAYS_PER_DAY = 3`（Server Action 内定数として定義） |
| 異常系 | `{ success: false, error: "daily play limit exceeded" }` を返す |
| 正常系 | play_count が上限未満であれば従来通り DB に保存 |
| 備考 | DB 側チェックのため、クライアントが偽データを送っても制限が効く |

### REQ-05: Turso クライアントタイムアウト（P2）

| 項目 | 内容 |
|------|------|
| 機能要件 | `lib/db.ts` の `createClient` に fetch タイムアウトを設定する |
| タイムアウト値 | 10000 ms（10 秒） |
| 効果 | ネットワーク切断時に Server Action がハングせず、エラーを早期に返す |
| 実装方法 | `createClient` の `fetch` オプションに `signal` を渡す形、または `fetchOptions` でタイムアウトを設定 |

### REQ-06: CORS ヘッダー（P2）

| 項目 | 内容 |
|------|------|
| 機能要件 | `/api/sync` の GET レスポンスに Capacitor WebView オリジンを許可する CORS ヘッダーを付与する |
| 許可オリジン | `capacitor://localhost`, `http://localhost` |
| 追加ヘッダー | `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` |
| OPTIONS ハンドラ | プリフライトリクエスト用に `export async function OPTIONS()` を追加 |

### REQ-07: nickname 文字種バリデーション（P2）

| 項目 | 内容 |
|------|------|
| 機能要件 | `upsertUser` の `input.nickname` に文字種バリデーションを追加する |
| 許可文字 | 日本語（ひらがな・カタカナ・漢字・全角）、英数字（半角・全角）、スペース、一部記号（`_`, `-`, `.`） |
| 禁止文字 | 制御文字（U+0000–U+001F, U+007F–U+009F）、絵文字ZWJ連結（絵文字爆弾対策） |
| 実装方法 | ホワイトリスト正規表現 `/^[\p{L}\p{N}\p{Z}_\-\.・\s]{1,12}$/u` を使用 |
| 異常系 | `{ success: false, error: "invalid nickname characters" }` を返す |

## 4. 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | レート制限 DB チェックは既存の `recordDailyPlay` と同一トランザクション内で完結し、DB ラウンドトリップを増やさない（同一クエリを再利用） |
| 後方互換性 | 既存の localStorage データ・ユーザーデータに影響を与えない |
| テスト容易性 | スコア上限値・MAX_PLAYS_PER_DAY は定数として外出しし、テストで参照可能にする |
| セキュリティ | サーバー側バリデーションを primary とし、クライアント側は UX 補助のみ |

## 5. 修正対象ファイル一覧

| ファイル | 修正内容 |
|----------|---------|
| `app/actions/user.ts` | REQ-01, REQ-03, REQ-04, REQ-07 |
| `lib/db.ts` | REQ-05 |
| `app/api/sync/route.ts` | REQ-06 |
| `capacitor.config.ts` | REQ-02 |
| `next.config.mjs` | 変更なし（確認のみ） |

## 6. 受け入れ条件

- [ ] `recordScore` に `score: 999999` を送信すると `score out of range` エラーが返る
- [ ] `recordScore` に各 gameId で定義した上限値+1 を送信すると reject される
- [ ] `upsertUser` に UUID 形式でない id を送信すると `invalid userId format` エラーが返る
- [ ] `upsertUser` に制御文字を含む nickname を送信すると `invalid nickname characters` エラーが返る
- [ ] 同一 gameId で 3 回 `recordScore` 成功後、4 回目が `daily play limit exceeded` で reject される
- [ ] `/api/sync` のレスポンスヘッダーに `Access-Control-Allow-Origin: capacitor://localhost` が含まれる
- [ ] `capacitor.config.ts` に `server.url` が設定されており、`webDir` より優先される
- [ ] Turso 接続タイムアウトが 10 秒に設定されている
