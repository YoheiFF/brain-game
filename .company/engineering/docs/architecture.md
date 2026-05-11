---
created: "2026-05-11"
topic: "BrainGame アーキテクチャ概要"
type: technical-doc
tags: [next.js, architecture, typescript]
---

# BrainGame アーキテクチャ概要

## 概要
Next.js 14 App Router + TypeScript + Tailwind CSS + localStorage のみで動作する
完全フロントエンドの脳トレ Web アプリ。Capacitor で Android にも対応。

## 設計・方針
- バックエンドなし、データは localStorage に永続化
- SSR 対応: 全 lib 関数に `typeof window === "undefined"` チェック
- 外部 UI ライブラリなし（SVG 手実装、Tailwind のみ）
- GameId を型エイリアスで統一管理

## 詳細

### ディレクトリ構成
```
app/
  page.tsx              ← ホーム（ゲームカード・プロフィール・ポイント）
  layout.tsx
  games/
    calculation/page.tsx
    memory-number/page.tsx
    stroop/page.tsx
    reaction/page.tsx
    pattern/page.tsx
  rankings/page.tsx     ← 種目別＋総合ランキング
  stats/page.tsx        ← 脳年齢・脳タイプ・称号・成長グラフ

components/
  GameHeader.tsx        ← ゲーム画面共通ヘッダー
  ResultModal.tsx       ← ゲーム結果モーダル
  NicknameModal.tsx     ← プロフィール設定
  RadarChart.tsx        ← SVG レーダーチャート（5角形）
  MiniBarChart.tsx      ← SVG 棒グラフ（14日間）

lib/
  scores.ts             ← 個人ベスト・ランキング管理
  daily.ts              ← デイリーチャレンジ（MAX=3回/日）
  brain-age.ts          ← 脳年齢算出（最近傍年代法）
  brain-type.ts         ← 脳タイプ・レーダーデータ（6タイプ）
  titles.ts             ← 称号システム（8個）
  benchmarks.ts         ← 年代別平均スコア
  game-points.ts        ← ゲームポイント計算（最大100点）
  nickname.ts           ← ニックネーム・年齢管理
```

### localStorage キー
| キー | 内容 |
|------|------|
| `braingame_scores` | 個人ベスト `{gameId: score}` |
| `braingame_rankings` | 全プレイ履歴 `{gameId: [{nickname, score, date}]}` |
| `braingame_nickname` | ニックネーム文字列 |
| `braingame_age` | 年齢数値 |
| `braingame_daily` | 当日のプレイ数・デイリーベスト |
| `braingame_daily_history` | 日別ポイント履歴（14日分） |

### ゲーム共通フロー
```
ready → playing → result
         ↓
       saveScore()     ← lib/scores.ts
       recordPlay()    ← lib/daily.ts
       setRemaining()  ← UI更新
```

### スコア記録の例外（複数 recordPlay 箇所）
- `memory-number`: timeout と wrong の両方に recordPlay あり
- `pattern`: wrong 時のみ recordPlay（正解ループは継続）

### 型定義
```typescript
type GameId = "calculation" | "memory-number" | "stroop" | "reaction" | "pattern"
type AgeGroup = "10代" | "20代" | "30代" | "40代" | "50代" | "60代以上"
type BrainType = "バランス型" | "計算特化型" | "記憶特化型" | "集中特化型" | "反応特化型" | "空間特化型"
type CognitiveSkill = "計算力" | "記憶力" | "集中力" | "反応速度" | "空間認識"
```

### 日付処理の注意点
`toISOString()` は UTC を返すため JST では深夜に日付がズレる。
`today()` は `new Date()` のローカルメソッド（getFullYear/getMonth/getDate）で生成。

## 参考
- 設計書: `docs/brain-game-score-features-basic-design.md`
- 詳細設計書: `docs/brain-game-score-features-detailed-design.md`
