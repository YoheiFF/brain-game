---
project_id: "2026-05-11-1600-mobile-security-audit"
phase: design
doc_type: basic-design
created: "2026-05-11"
---

# 基本設計書: モバイルリリース向けセキュリティ修正

## 1. システム構成

### 1.1 現状のアーキテクチャ（問題あり）

```
[Android APK]
  └── Capacitor WebView
        └── webDir: "out" (ローカル静的ファイル)
              └── Next.js 静的エクスポート（未生成）
                    └── Server Actions → 動作しない
```

**問題点:** `next.config.mjs` に `output: "export"` が存在しないため、
`npm run build` では `out/` が生成されない。
Server Actions は静的エクスポートと根本的に非互換であり、
APK 内のローカルファイルからは呼び出せない。

### 1.2 修正後のアーキテクチャ（server.url 方式）

```
[Android APK]
  └── Capacitor WebView
        └── server.url: "https://<vercel-url>" を参照
              └── Vercel 上の Next.js サーバー
                    ├── Server Actions (app/actions/user.ts)
                    ├── /api/sync (app/api/sync/route.ts)
                    └── Turso (DB)

[ブラウザ / PWA]
  └── 同一 Next.js サーバーを直接参照
```

**メリット:**
- Server Actions・API Routes が完全に動作する
- APK を再ビルドせずにサーバー側コードを更新できる
- `next.config.mjs` を変更しない（サーバーモード維持）

**考慮事項:**
- オフライン時は /api/sync が失敗するが、既存のフォールバック（localStorage）で対応
- `server.url` に開発時の localhost を設定しないよう注意

---

## 2. バリデーション設計

### 2.1 gameId 別スコア上限値定義

`app/actions/user.ts` に定数 `SCORE_LIMITS` として定義する。

| gameId | lowerIsBetter | MIN（下限） | MAX（上限） | 根拠 |
|--------|:---:|------------|------------|------|
| calculation | false | 0 | 60 | 60 秒で 60 問が物理的な限界（1問1秒） |
| memory-number | false | 0 | 20 | 世界記録級（通常は 10 桁前後） |
| stroop | false | 0 | 60 | 60 秒で 60 個が物理的な限界 |
| reaction | true（低いほど優秀） | 50 | 2000 | 50ms 未満は不可、2000ms 超は正常プレイ外 |
| pattern | false | 0 | 25 | 5×5 グリッドの全セル数（最大想定） |

reaction は `lowerIsBetter: true` のため：
- `score < MIN（50）` → reject（チート）
- `score > MAX（2000）` → reject（異常値）

その他のゲームは：
- `score < 0` → reject（既存チェックを統合）
- `score > MAX` → reject（新規追加）

### 2.2 バリデーション実行順序（recordScore）

```
recordScore(input)
  │
  ├─[1] userId 存在チェック（既存）
  │       └── 空文字 → reject "userId is required"
  │
  ├─[2] gameId 有効チェック（既存）
  │       └── GAME_IDS 外 → reject "invalid gameId"
  │
  ├─[3] スコア範囲チェック（新規）
  │       └── SCORE_LIMITS[gameId] を参照
  │           ├── lowerIsBetter=true:  score < MIN or score > MAX → reject "score out of range"
  │           └── lowerIsBetter=false: score < 0 or score > MAX  → reject "score out of range"
  │
  ├─[4] レート制限チェック（新規）
  │       └── DB から当日の play_count を取得
  │           └── play_count >= MAX_PLAYS_PER_DAY(3) → reject "daily play limit exceeded"
  │
  └─[5] DB 保存（既存）
          ├── saveScoreToDb()
          ├── recordDailyPlay()
          └── updateDailyHistory()
```

### 2.3 バリデーション実行順序（upsertUser）

```
upsertUser(input)
  │
  ├─[1] UUID 形式チェック（新規）
  │       └── UUID_REGEX 不一致 → reject "invalid userId format"
  │
  ├─[2] nickname 空チェック（既存）
  │       └── 長さ 0 → reject "nickname is empty"
  │
  ├─[3] nickname 長さチェック（既存）
  │       └── 12 文字超 → reject "nickname too long"
  │
  ├─[4] nickname 文字種チェック（新規）
  │       └── NICKNAME_REGEX 不一致 → reject "invalid nickname characters"
  │
  ├─[5] 年齢範囲チェック（既存）
  │       └── 1〜120 範囲外 → reject "invalid age"
  │
  └─[6] DB 保存（既存）
          ├── getOrCreateUser()
          └── updateUser()
```

---

## 3. レート制限設計

### 3.1 DB チェックフロー

```
recordScore が呼び出される
       │
       ▼
daily_plays テーブルを参照
  SELECT play_count
  FROM daily_plays
  WHERE user_id = ? AND game_id = ? AND play_date = TODAY
       │
       ├── レコードなし → play_count = 0
       └── レコードあり → play_count = 既存値
       │
       ▼
play_count >= MAX_PLAYS_PER_DAY(3)?
       │
       ├── YES → { success: false, error: "daily play limit exceeded" }
       │         （DB 保存なし）
       │
       └── NO → 続行（saveScoreToDb, recordDailyPlay, updateDailyHistory）
                  └── recordDailyPlay 内で play_count が +1 される
```

### 3.2 実装上の注意

- レート制限チェックは `recordDailyPlay` を呼ぶ前に実行する
- `recordDailyPlay` は内部で `play_count + 1` を行うため、
  チェック時点の `play_count` が `MAX - 1`（= 2）の場合は通過させ、
  `recordDailyPlay` 後に `play_count = 3` になる（これが 3 回目）
- チェック条件: `play_count >= MAX_PLAYS_PER_DAY`（3 以上なら reject）
- `daily_plays` へのアクセスは `recordDailyPlay` 内でも行われるが、
  レート制限チェック用に事前に別クエリを発行する
  （`lib/db-scores.ts` の `getDailyPlaysFromDb` を流用するか、Server Action 内に直接クエリを追加する）

### 3.3 レート制限定数

```typescript
const MAX_PLAYS_PER_DAY = 3; // app/actions/user.ts 内定数
```

---

## 4. CORS 設計

### 4.1 対象エンドポイント

`/api/sync` のみ。Server Actions は Next.js フレームワークが制御するため対象外。

### 4.2 許可オリジン

| オリジン | 理由 |
|---------|------|
| `capacitor://localhost` | Capacitor Android WebView の標準オリジン |
| `http://localhost` | Capacitor iOS WebView / ローカル開発環境 |

### 4.3 レスポンスヘッダー

```
Access-Control-Allow-Origin: capacitor://localhost
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

注: `Access-Control-Allow-Origin` は複数値を列挙できないため、
リクエストの `Origin` ヘッダーを読んで動的に設定するか、
`*` を使用する（個人データ含む API のため `*` は非推奨）。

**実装方針:** リクエストの Origin ヘッダーを確認し、
許可リスト内であれば動的に `Access-Control-Allow-Origin` に設定する。

### 4.4 OPTIONS プリフライト

Capacitor WebView から fetch 時にプリフライトが発生する場合があるため、
`export async function OPTIONS()` を追加して 204 を返す。

---

## 5. Capacitor デプロイアーキテクチャ

### 5.1 修正前後の比較

**Before:**
```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'com.braingame.app',
  appName: 'BrainGame',
  webDir: 'out',          // ← 静的ファイルを参照（Server Actions 不可）
  android: {
    backgroundColor: '#0a0a1a',
  },
};
```

**After:**
```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'com.braingame.app',
  appName: 'BrainGame',
  webDir: 'out',          // ← server.url が設定されている場合は参照されない
  server: {
    url: 'https://REPLACE_WITH_VERCEL_URL',  // ← Vercel URL に置換する
    cleartext: false,
  },
  android: {
    backgroundColor: '#0a0a1a',
  },
};
```

### 5.2 デプロイフロー

```
1. Next.js を Vercel にデプロイ
   └── git push origin main → GitHub Actions → Vercel

2. デプロイ URL を確認
   └── https://brain-game-XXXX.vercel.app

3. capacitor.config.ts の REPLACE_WITH_VERCEL_URL を実際の URL に置換

4. Android APK をビルド
   └── npx cap sync android
   └── npx cap build android（または Android Studio でビルド）

5. APK 配布
   └── Google Play Store / 直接配布
```

---

## 6. Turso タイムアウト設計

### 6.1 現状

```typescript
client = createClient({ url, authToken });
```

タイムアウトなし。接続応答がない場合、Server Action がハングする。

### 6.2 修正後

`@libsql/client/web` の `createClient` は標準の fetch を使用する。
`fetchOptions` または fetch 関数を差し替えることでタイムアウトを実装する。

```typescript
// fetchOptions を使って AbortSignal でタイムアウトを設定
client = createClient({
  url,
  authToken,
  fetch: (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    return fetch(input, { ...init, signal: controller.signal })
      .finally(() => clearTimeout(timeout));
  },
});
```

タイムアウト値: **10000 ms（10 秒）**

---

## 7. モジュール依存関係

```
app/actions/user.ts
  ├── lib/db-scores.ts (recordDailyPlay, saveScoreToDb, updateDailyHistory)
  │     └── lib/db.ts (getDb)
  │           └── @libsql/client/web
  └── lib/scores.ts (GAME_IDS, GAME_META)

app/api/sync/route.ts
  └── lib/db-scores.ts (各 getter)
        └── lib/db.ts (getDb)

capacitor.config.ts
  └── @capacitor/cli (CapacitorConfig 型)
```

新規追加する依存:
- `app/actions/user.ts` → `lib/db.ts` の `getDb`（レート制限チェック用に直接 DB クエリを追加）
  または `lib/db-scores.ts` に `getPlayCountForToday` 関数を追加してインポート
