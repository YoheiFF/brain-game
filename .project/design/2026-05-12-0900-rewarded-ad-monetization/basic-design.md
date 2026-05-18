---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
phase: design/basic
created: "2026-05-12"
---
# 基本設計: リワード広告マネタイズ機能

---

## 1. 全体アーキテクチャ

```
┌────────────────────────────────────────────────────────────┐
│  Android アプリ（Capacitor WebView）                        │
│                                                             │
│  ┌──────────────────────────────────────┐                  │
│  │  Next.js App (WebView)               │                  │
│  │                                      │                  │
│  │  app/layout.tsx                      │                  │
│  │   └─ <AdMobInit />  ←── 起動時1回だけ初期化             │
│  │                                      │                  │
│  │  app/games/*/page.tsx（×5ゲーム）    │                  │
│  │   ├─ remaining state                 │                  │
│  │   ├─ rewardedRemaining state         │                  │
│  │   └─ <WatchAdButton />              │                  │
│  │        └─ showRewardedAd()          │                  │
│  │             └─ recordRewardedPlay() │                  │
│  │                                      │                  │
│  │  lib/daily.ts  ─── localStorage     │                  │
│  │  lib/admob.ts  ─── Capacitor Bridge │                  │
│  └──────────────────────────────────────┘                  │
│                ↕ Capacitor Bridge                           │
│  ┌──────────────────────────────────────┐                  │
│  │  Android Native                      │                  │
│  │  └─ AdMob SDK (Google Play Services)│                  │
│  └──────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────┘
                ↕ HTTPS (API 呼び出し)
┌────────────────────────────────────────────────────────────┐
│  Vercel (Next.js API Routes)                                │
│  └─ POST /api/record-score                                 │
│       └─ Turso DB (daily_plays テーブル)                   │
└────────────────────────────────────────────────────────────┘
```

---

## 2. モジュール分割

| モジュール | ファイルパス | 責務 |
|---|---|---|
| AdMob ラッパー | `lib/admob.ts` | SDK 初期化・リワード広告表示・イベントリスナー管理 |
| デイリー管理 | `lib/daily.ts` | localStorage 読み書き・プレイ回数計算・リワード記録 |
| 初期化コンポーネント | `components/AdMobInit.tsx` | アプリ起動時に1回だけ `initAdMob()` を呼ぶ副作用コンポーネント |
| 広告視聴ボタン | `components/WatchAdButton.tsx` | 広告視聴 UI・ロード状態管理・エラー表示・リワード通知 |
| ゲームページ（×5） | `app/games/*/page.tsx` | ゲーム状態管理・残り回数 state・WatchAdButton 制御 |
| スコア記録 API | `app/api/record-score/route.ts` | DB の play_count によるサーバー側上限チェック（二重防衛） |
| Android マニフェスト | `android/app/src/main/AndroidManifest.xml` | AdMob App ID 宣言・パーミッション宣言 |

---

## 3. データフロー

### 3.1 初期化フロー

```
アプリ起動
  → app/layout.tsx マウント
  → AdMobInit useEffect 発火
  → initAdMob()
     → Capacitor.isNativePlatform() チェック
     → true: AdMob.initialize({ testingDevices: [], initializeForTesting: true })
     → false (Web): 何もしない（早期リターン）
```

### 3.2 ゲーム開始フロー（制限なし）

```
ゲームページ初期表示
  → useEffect: getRemainingPlays(gameId) → remaining state
  → useEffect: getRewardedRemaining(gameId) → rewardedRemaining state
  → remaining > 0: 「スタート（残りN回）」ボタン表示
  → ユーザーがスタート → ゲームプレイ
  → ゲーム終了: endGame() 呼び出し
     → recordPlay(gameId, score)     ← localStorage plays +1
     → getRemainingPlays(gameId)     ← remaining state 更新
```

### 3.3 リワード広告視聴フロー

```
remaining === 0 の状態で ready フェーズ
  → WatchAdButton 表示（rewardedRemaining を props として渡す）
  → ユーザーが「広告を見て+1プレイ」ボタンを押す
  → handleClick() 実行
     → setLoading(true)
     → showRewardedAd() 呼び出し
        [Native]
        → AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID })
        → AdMob.showRewardVideoAd()
        → イベント待機（Promise）
           → RewardAdPluginEvents.Rewarded 発火 → done(true)
           → RewardAdPluginEvents.Dismissed 発火 → done(false) ※先着優先
        [Web]
        → 即 true を返す（バイパス）
     → rewarded === true の場合:
        → recordRewardedPlay(gameId)  ← localStorage rewardedPlays +1
        → onRewarded() コールバック
           → getRemainingPlays(gameId)    ← remaining state 更新
           → getRewardedRemaining(gameId) ← rewardedRemaining state 更新
     → rewarded === false の場合:
        → setFailed(true) でエラーメッセージ表示
     → setLoading(false)
```

### 3.4 サーバー側二重防衛フロー

```
ゲーム終了時の saveScore() 呼び出し
  → POST /api/record-score
  → サーバー: daily_plays テーブルから play_count 取得
  → play_count >= 6 なら 429 エラーを返す
  → play_count < 6 なら DB 書き込み実行
```

---

## 4. データ構造

### 4.1 localStorage キー構造

```
キー: "braingame_daily"
値: DailyRecord (JSON)

interface DailyRecord {
  date: string                              // "YYYY-MM-DD"
  plays: Partial<Record<GameId, number>>    // プレイ済み回数
  bestScores: Partial<Record<GameId, number>> // 本日のベストスコア
  rewardedPlays?: Partial<Record<GameId, number>> // 広告視聴で得たプレイ権利数
}
```

日付が変わった場合: `parsed.date !== today()` となり `{ date: today(), plays: {}, bestScores: {} }` で上書き（自動リセット）

### 4.2 DB テーブル（参照のみ）

```sql
-- daily_plays テーブル（既存）
-- user_id, game_id, play_date の組み合わせで play_count を管理
-- MAX_PLAYS_PER_DAY = 6 でチェック
```

---

## 5. 外部インターフェース

### 5.1 AdMob SDK（Capacitor ブリッジ経由）

| 関数 | 用途 |
|---|---|
| `AdMob.initialize({ testingDevices, initializeForTesting })` | SDK 初期化 |
| `AdMob.prepareRewardVideoAd({ adId })` | 広告ロード |
| `AdMob.showRewardVideoAd()` | 広告表示 |
| `AdMob.addListener(RewardAdPluginEvents.Rewarded, fn)` | 報酬確定イベント |
| `AdMob.addListener(RewardAdPluginEvents.Dismissed, fn)` | 広告クローズイベント |

### 5.2 内部 API

| エンドポイント | メソッド | 用途 |
|---|---|---|
| `/api/record-score` | POST | スコア記録・サーバー側プレイ上限チェック |

---

## 6. エラーハンドリング方針

| エラー発生箇所 | エラー種別 | 対処 |
|---|---|---|
| `AdMob.initialize()` 失敗 | SDK 初期化エラー | `console.warn` のみ。ゲーム自体は続行可能 |
| `AdMob.prepareRewardVideoAd()` 失敗 | 広告ロードエラー | `showRewardedAd()` が `false` を返す |
| `RewardAdPluginEvents.Dismissed` 先着 | 報酬なし終了 | `showRewardedAd()` が `false` を返す。WatchAdButton がエラー表示・リトライ可能 |
| `POST /api/record-score` が 429 | サーバー側上限超過 | クライアント改ざん検知。スコアは記録されない（UX への直接影響は軽微）|
| localStorage アクセス失敗 | 例外 | `try/catch` でデフォルト値返却。ゲーム続行可能 |

---

## 7. セキュリティ考慮事項

- クライアント localStorage は改ざん可能だが、サーバー API 側で DB の `play_count` で二重チェックしているため致命的ではない
- 本番リリース時にテスト広告 ID・`initializeForTesting: true` を除去すること（詳細は詳細設計書の「本番リリース手順」参照）
- GDPR 対応（UMP コンセント取得）は本機能スコープ外。EU 配信検討時は別途設計が必要

---

## 8. 未対応事項（将来対応）

- iOS 対応: `Info.plist` への `GADApplicationIdentifier` 追加・SKAdNetwork 設定が必要
- GDPR / UMP コンセント取得フロー
- Web 版のプレイ回数制限方針（現状は無制限バイパス）
- メディエーション利用時の Dismissed 先着問題への対策
