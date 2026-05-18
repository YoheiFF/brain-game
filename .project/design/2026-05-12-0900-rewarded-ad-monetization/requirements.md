---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
phase: design/requirements
created: "2026-05-12"
---
# 要件定義: リワード広告マネタイズ機能

---

## 1. Why（なぜ作るか）

BrainGame は Android ネイティブアプリ（Capacitor ラッパー）として配信されるカジュアル脳トレゲームである。
ゲームの継続利用と収益化を両立させるため、**1日あたりのプレイ回数制限**と**リワード広告視聴によるプレイ回数追加**の仕組みを導入する。

- ユーザーに「もっとやりたい」という動機を与えながら広告収益を獲得する
- 強制広告ではなくユーザーの意志で視聴するリワード広告形式とすることで UX を損なわない
- 課金モデルを持たない段階での唯一の収益源として機能させる

---

## 2. What（何を実現するか）

### 2.1 プレイ回数管理

| 種別 | 定数名 | 値 | 説明 |
|---|---|---|---|
| 基本プレイ上限 | `MAX_PLAYS_PER_DAY` | 3 | 1ゲームあたり1日に無料でプレイできる回数 |
| リワード追加上限 | `MAX_REWARDED_PLAYS_PER_DAY` | 3 | 広告視聴で追加できる最大回数 |
| 合計上限 | - | 6 | サーバー側 API でも同一値で二重チェック |

- 制限はゲームID単位で管理する（全5ゲーム: calculation / memory-number / stroop / reaction / pattern）
- 日付をまたいだ場合は自動リセットされる
- 管理方式: クライアント側 localStorage（キー: `braingame_daily`）+ サーバー側 DB（`daily_plays` テーブル）の二層構造

### 2.2 リワード広告

- AdMob リワード広告（動画広告）を使用する
- プラットフォーム: Android のみ（iOS は将来対応）
- Web 版（Vercel デプロイ）: 広告をスキップして常にリワード付与（開発・Web版ユーザー向けバイパス）
- 広告視聴に成功したとき、対象ゲームの `rewardedPlays` を +1 し残りプレイ回数を +1 する

### 2.3 ユーザー体験フロー

1. ゲームの ready 画面で残りプレイ回数を表示する
2. 残りプレイ回数が 0 になったとき、スタートボタンの代わりに `WatchAdButton` を表示する
3. `WatchAdButton` はリワード残り回数（`rewardedRemaining`）を表示し、0 になったら「明日また挑戦しよう！」に切り替わる
4. 広告視聴後、残りプレイ回数と広告残り回数を即時更新して続けてプレイできる

---

## 3. How（どう実現するか）

### 3.1 技術スタック

- AdMob SDK: `@capacitor-community/admob@^8.0.0`
- Capacitor: `@capacitor/core@^8.3.2` / `@capacitor/android@^8.3.2`
- フレームワーク: Next.js 14 (App Router) + TypeScript
- データ永続化: localStorage（クライアント）+ Turso/SQLite（サーバー）

### 3.2 アーキテクチャ概要

```
Android ネイティブ層
  └─ AdMob SDK (Google Play Services)
       ↕ Capacitor ブリッジ
Next.js (WebView)
  ├─ lib/admob.ts          ← SDK 初期化・広告表示ロジック
  ├─ lib/daily.ts          ← プレイ回数管理ロジック
  ├─ components/AdMobInit.tsx   ← 初期化副作用コンポーネント
  ├─ components/WatchAdButton.tsx ← 広告視聴ボタン UI
  └─ app/games/*/page.tsx  ← 各ゲームページ（5本）
```

### 3.3 非機能要件

- リスナーはイベント発火後に必ず除去し、メモリリークを防止する
- 広告ロード失敗時はエラーメッセージを表示し、リトライを可能にする
- サーバー側 API で DB の `play_count` を参照し、クライアント改ざんに対する二重防衛とする
- 本番リリース前にテスト用広告 ID・初期化フラグを必ず本番値に差し替える（詳細は詳細設計書の「本番リリース手順」参照）

---

## 4. 前提条件・制約

- Android 端末のみ本番広告が表示される（iOS は `Info.plist` 未設定のため対象外）
- Web 環境では `Capacitor.isNativePlatform()` が `false` を返すため広告 SDK は起動しない
- GDPR / UMP コンセント対応は本機能のスコープ外（EU 配信時は別途対応が必要）
- 現在 `initializeForTesting: true` および Google テスト用広告 ID を使用中。本番リリース前に必ず差し替えること
