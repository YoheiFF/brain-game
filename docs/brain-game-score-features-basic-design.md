# 基本設計書: BrainGame スコア活用機能

> **Claude Code への依頼として使用できます。**
> まずこのドキュメントを読み、次に詳細設計書を確認してから実装してください。

## 概要
BrainGame の5種目スコアを活用し、「脳年齢診断」「脳タイプ分析＋レーダーチャート」「称号システム」「デイリーチャレンジ＋成長グラフ」「プレイ上限」を追加する。

## 最初に読むべきファイル
- @lib/scores.ts — スコア管理・データ構造
- @lib/benchmarks.ts — 年代別平均テーブル
- @lib/nickname.ts — ニックネーム・年齢管理
- @app/page.tsx — ホーム画面
- @docs/brain-game-score-features-detailed-design.md — 詳細設計（実装依頼時はこちら）

## スコープ

### 対象（実装すること）
- `lib/daily.ts` — デイリー管理（プレイ回数・上限・成長履歴）
- `lib/brain-age.ts` — 脳年齢算出
- `lib/brain-type.ts` — 脳タイプ判定・レーダーデータ
- `lib/titles.ts` — 称号定義・取得ロジック
- `components/RadarChart.tsx` — SVGレーダーチャート
- `components/MiniBarChart.tsx` — SVG成長グラフ（バー）
- `app/stats/page.tsx` — 統計ページ（脳年齢・レーダー・称号・成長グラフ）
- ホーム画面の更新（残プレイ数表示・統計ページリンク）
- 全5ゲームの ready フェーズにプレイ上限チェック追加

### 対象外（実装しないこと）
- サーバーサイド処理 — 完全フロントエンド（localStorage）のまま
- チャートライブラリの導入 — カスタムSVGで実装
- プッシュ通知 — デイリーリマインドは対象外

## アーキテクチャ概観

### ファイル構成
```
lib/
  daily.ts          ← 新規: プレイ回数・上限・デイリー履歴
  brain-age.ts      ← 新規: 脳年齢算出
  brain-type.ts     ← 新規: 脳タイプ・レーダーデータ
  titles.ts         ← 新規: 称号定義・取得

components/
  RadarChart.tsx    ← 新規: SVGレーダーチャート
  MiniBarChart.tsx  ← 新規: SVG成長グラフ

app/
  stats/
    page.tsx        ← 新規: 統計ページ
  page.tsx          ← 更新: 残プレイ数・統計リンク
  games/
    calculation/page.tsx    ← 更新: プレイ上限チェック + タイマー色バグ修正
    memory-number/page.tsx  ← 更新: プレイ上限チェック
    stroop/page.tsx         ← 更新: プレイ上限チェック
    reaction/page.tsx       ← 更新: プレイ上限チェック
    pattern/page.tsx        ← 更新: プレイ上限チェック
```

### データフロー

```
ホーム画面
  ↓ 各ゲームカードに「残り○回」表示
  ↓ 「脳の統計」ボタン → /stats

各ゲーム（ready フェーズ）
  ↓ canPlay(gameId) チェック
  ↓ false → スタートボタン無効 + 「本日の上限（3回）に達しました」
  ↓ true → ゲーム開始
  ↓ ゲーム終了 → recordPlay(gameId, score) でプレイ記録

/stats ページ
  ↓ 脳年齢: calcBrainAge(bests) → "あなたの脳年齢は ○○歳"
  ↓ レーダー: getRadarData(bests) → RadarChart に渡す
  ↓ 脳タイプ: getBrainType(radarData) → "記憶特化型" など
  ↓ 称号: getAllTitles(bests, totalPlays) → 全称号一覧（獲得状態付き）
  ↓ 成長グラフ: getDailyHistory(14) → MiniBarChart に渡す
```

### localStorage キー一覧

| キー | 内容 | 既存/新規 |
|------|------|---------|
| `braingame_scores` | 全ゲームの個人ベスト | 既存 |
| `braingame_rankings` | 全プレイ履歴 | 既存 |
| `braingame_nickname` | ニックネーム | 既存 |
| `braingame_age` | 年齢 | 既存 |
| `braingame_daily` | 今日のプレイ回数・ベスト | **新規** |
| `braingame_daily_history` | 日別スコア履歴 | **新規** |

## 技術方針・根拠
- **SVGチャート採用** — ライブラリ追加なし・Capacitorモバイルとの相性問題を避ける
- **daily.ts に上限管理を集約** — 既存の `scores.ts` を変更せず、ゲーム側から呼ぶ形にする
- **脳年齢は最近傍年代法** — reactionのベンチマークが非単調のため線形補間は不可。最もスコアが近い年代を採用
- **レーダー値は0〜100正規化** — 20代平均スコアを50として換算
- **日付はローカル日付** — `toISOString()` はUTCのためJSTでは深夜に日付ズレが発生する。`new Date()` のローカルメソッドを使用

## 制約・注意事項
IMPORTANT: 以下の制約を必ず守ること。
- localStorage キーは既存の `braingame_*` プレフィックスに統一
- SSR 対応: `typeof window === "undefined"` チェックを全 lib ファイルに入れる
- プレイ上限は `MAX_PLAYS_PER_DAY = 3` の定数で管理（変更容易にする）
- 日付は `new Date()` のローカルメソッドで取得（`toISOString()` 禁止）
- 既存の `saveScore()` インターフェースは変更しない

## 参照
- 詳細設計書: `docs/brain-game-score-features-detailed-design.md`
