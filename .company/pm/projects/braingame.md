---
created: "2026-05-11"
project: "BrainGame"
status: in-progress
source: "docs/brain-game-score-features-basic-design.md, docs/brain-game-score-features-detailed-design.md"
tags: [next.js, typescript, brain-training, capacitor]
---

# プロジェクト: BrainGame

## 概要
脳トレ Web アプリ。5種類の認知機能テストでスコアを競う。
Next.js 14 (App Router) + TypeScript + Tailwind CSS + localStorage。
Capacitor で Android アプリにも対応。

## ゴール
- 5種類の脳トレゲームで楽しみながら認知機能を測定・改善できるアプリ
- ランキング・統計・脳年齢診断・称号など継続モチベーション機能の充実

## 設計資源（ClaudeCompany 由来）
- 基本設計書: `docs/brain-game-score-features-basic-design.md`
- 詳細設計書: `docs/brain-game-score-features-detailed-design.md`
- 要件定義書: なし（設計書に内包）
- UI 参考画像: `discord-attachments/` (4枚)

## 実装完了済み機能（2026-05-11 時点）

| 機能 | 状態 | 備考 |
|------|------|------|
| 5種類のゲーム | ✅ 完了 | calculation, memory-number, stroop, reaction, pattern |
| 個人ベスト記録 | ✅ 完了 | localStorage: braingame_scores |
| 全プレイ履歴 | ✅ 完了 | localStorage: braingame_rankings |
| 種目別ランキング | ✅ 完了 | rankings/page.tsx |
| 総合ランキング | ✅ 完了 | 20代平均基準換算・最大100点 |
| デイリー管理 | ✅ 完了 | lib/daily.ts, MAX_PLAYS_PER_DAY=3 |
| 脳年齢診断 | ✅ 完了 | lib/brain-age.ts, 最近傍年代法 |
| 脳タイプ分析 | ✅ 完了 | lib/brain-type.ts, 6タイプ |
| 称号システム | ✅ 完了 | lib/titles.ts, 8個 |
| レーダーチャート | ✅ 完了 | components/RadarChart.tsx, SVG手実装 |
| 成長グラフ | ✅ 完了 | components/MiniBarChart.tsx, 14日間 |
| 統計ページ | ✅ 完了 | stats/page.tsx |
| プロフィール | ✅ 完了 | ニックネーム・年齢・NicknameModal |
| Android 対応 | ✅ 完了 | Capacitor 8.3 |
| モバイルキーボード対応 | ✅ 完了 | 計算ゲームに決定ボタン |

## マイルストーン
| # | マイルストーン | 期限 | 状態 |
|---|-------------|------|------|
| 1 | 5ゲーム実装 | - | ✅ 完了 |
| 2 | ランキング機能 | - | ✅ 完了 |
| 3 | 統計・脳年齢・称号 | - | ✅ 完了 |
| 4 | デイリー管理・ポイント表示 | - | ✅ 完了 |
| 5 | 次フェーズ（未定） | - | 🔲 未着手 |

## 関連チケット
- [x] `2026-05-11-ranking-score-refactor.md` — ランキング計算ロジック修正（done）
- [x] `2026-05-11-pattern-game-grid-5x5.md` — 図形記憶グリッド4×4→5×5（done）

## 関連部署
- engineering: 実装担当
- research: 新機能の技術調査

## メモ
- TODO コメントはコード内に存在しない（設計書のタスク0〜9は全完了）
- JST 日付対応済み（UTC バグ修正済み）
- SSR 対応: 全 lib で `typeof window === "undefined"` チェック実装
