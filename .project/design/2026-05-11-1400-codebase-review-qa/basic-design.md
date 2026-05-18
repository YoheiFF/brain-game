---
project_id: "2026-05-11-1400-codebase-review-qa"
phase: design
doc_type: basic-design
created: "2026-05-11"
---

# 基本設計: 図形記憶ゲーム グリッド変更

## 1. pattern ゲームのアーキテクチャ概要

```
app/games/pattern/page.tsx   ← ゲーム本体（UIロジック一体型 "use client" コンポーネント）
  │
  ├── components/GameHeader.tsx       ← タイトル・説明ヘッダ（汎用）
  ├── components/ResultModal.tsx      ← ゲーム終了時リザルト表示（汎用）
  │     └── lib/game-points.ts        ← スコア → 1〜20点換算（REFERENCE["pattern"] = 18）
  │
  ├── lib/scores.ts                   ← スコア永続化・ランキング集計（localStorage）
  │     └── POINTS_REF["pattern"] = 18（20代平均基準）
  ├── lib/daily.ts                    ← 1日3回プレイ制限・デイリー履歴（localStorage）
  │     └── REFERENCE["pattern"] = 18
  ├── lib/benchmarks.ts               ← 年代別平均スコア参照（固定値テーブル）
  │     └── BENCHMARKS["pattern"]["20代"] = 18
  └── lib/nickname.ts                 ← ニックネーム・年齢取得（localStorage）
```

### レイヤー責務

| レイヤー | ファイル | 責務 |
|---------|---------|------|
| UI/ゲームロジック | `app/games/pattern/page.tsx` | フェーズ管理・パターン生成・グリッドレンダリング・スコア集計 |
| 共通UIコンポーネント | `components/ResultModal.tsx`, `components/GameHeader.tsx` | 再利用可能なUI部品 |
| データアクセス | `lib/scores.ts`, `lib/daily.ts` | localStorage の読み書き・ランキング計算 |
| 参照データ | `lib/benchmarks.ts`, `lib/game-points.ts` | 定数・変換ロジック |

---

## 2. GRID 定数の影響範囲

### 2.1 GRID 定数の定義

```typescript
// app/games/pattern/page.tsx
const GRID = 5;          // グリッド1辺のセル数
const TOTAL = GRID * GRID; // 総セル数（25）
```

GRID 定数は `app/games/pattern/page.tsx` の **1箇所のみ** に定義されており、以下のすべての値が連動する。

### 2.2 GRID から派生する値の一覧

| 派生値 | 式 | GRID=4 時 | GRID=5 時 |
|--------|---|----------|----------|
| 総セル数 | `GRID * GRID` | 16 | 25 |
| 最大表示マス数 | `TOTAL - 1` | 15 | 24 |
| パターンマス数（lvl N） | `Math.min(lvl + 2, TOTAL - 1)` | 最大 15 | 最大 24 |
| CSS グリッド列数 | `repeat(${GRID}, 1fr)` | 4列 | 5列 |

### 2.3 GRID に非依存なコンポーネント（変更不要）

以下の lib・コンポーネントはゲームの生スコア（正解レベル数）のみを受け取るため、GRID 変更の影響を受けない。

| ファイル | pattern 関連の値 | GRID 依存 |
|---------|----------------|---------|
| `lib/scores.ts` | `POINTS_REF["pattern"] = 18` | なし |
| `lib/daily.ts` | `REFERENCE["pattern"] = 18` | なし |
| `lib/game-points.ts` | `REFERENCE["pattern"] = 18` | なし |
| `lib/benchmarks.ts` | `BENCHMARKS["pattern"][age]` | なし |
| `components/ResultModal.tsx` | `score`, `best`, `benchmark` props | なし |

---

## 3. データフロー

### 3.1 ゲームプレイ中のデータフロー

```
[ユーザー操作: セル選択 → 決定ボタン]
        │
        ▼
handleSubmit()
  ├─ [正解] score + 1 → setPhase("correct") → startRound(level + 1)
  │                       └─ generatePattern(Math.min(lvl+2, TOTAL-1))
  │                            └─ ランダムに count 個の index ∈ [0, TOTAL-1] を Set<number> で生成
  │
  └─ [不正解] setPhase("wrong") → 1.5秒後
                ├─ saveScore("pattern", score, nickname)  → lib/scores.ts → localStorage
                ├─ recordPlay("pattern", score)           → lib/daily.ts  → localStorage
                ├─ setRemaining(getRemainingPlays("pattern"))
                └─ setPhase("result") → ResultModal 表示
```

### 3.2 グリッドレンダリングのデータフロー

```
GRID (定数: 5)
  │
  ├─ TOTAL = 25
  │     └─ Array.from({ length: 25 }) → 25 個のセルをレンダリング
  │
  └─ gridTemplateColumns: "repeat(5, 1fr)"  → CSS グリッド 5 列

各セルの状態:
  phase === "showing" → pattern.has(i) ? 紫点灯 : 暗
  phase === "input"   → selected.has(i) ? 紫選択中 : 暗（hover: 紫枠）
  phase === "correct" → pattern.has(i) ? 緑 : 暗
  phase === "wrong"   → wrongCells.has(i) ? 赤 |
                        (isPattern && !isSelected) ? 紫（正解未選択） |
                        (isPattern && isSelected) ? 緑（正解選択済） |
                        暗
```

### 3.3 スコア保存のデータフロー

```
saveScore("pattern", score, nickname)
  │
  ├─ loadPersonal() → braingame_scores (localStorage)
  │     └─ personal["pattern"] = max(prevBest, score)
  │
  └─ loadRankings() → braingame_rankings (localStorage)
        └─ rankings["pattern"].push({ nickname, score, date })

recordPlay("pattern", score)
  └─ loadDaily() → braingame_daily (localStorage)
        ├─ plays["pattern"] += 1
        ├─ bestScores["pattern"] = max(prev, score)
        └─ updateDailyHistory() → braingame_daily_history (localStorage)
              └─ REFERENCE["pattern"] = 18 を基準にポイント換算
```

---

## 4. レイアウト計算

### 5×5 グリッドの幅計算

```
セルサイズ: 48px × 5 = 240px
gap-2 × 4:   8px × 4 =  32px  (Tailwind gap-2 = 0.5rem = 8px)
グリッド合計:           272px
カード padding (p-6): 24px × 2 = 48px
合計:                  320px

max-w-sm (384px) > 320px → 余裕 64px あり
最小幅 320px 端末:  320px - 48px(padding) = 272px ≥ 272px → ギリギリ収まる

※ 実機確認が推奨される（情報収集レポートのリスク指摘より）
```

---

## 5. ゲームフェーズ状態遷移

```
"ready"
  │ startGame()
  ▼
"showing" ──(1200 + lvl*100 ms)──▶ "input"
                                      │
                          ┌───────────┴──────────┐
                          │ 正解                  │ 不正解
                          ▼                       ▼
                       "correct"               "wrong"
                          │ 800ms                  │ 1500ms
                          ▼                        ▼
                       "showing"(次レベル)       "result"
                                                   │ onRetry
                                                   ▼
                                                "ready" または startGame()
```
