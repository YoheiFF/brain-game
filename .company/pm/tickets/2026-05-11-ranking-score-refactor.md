---
created: "2026-05-11"
project: "BrainGame"
assignee: "engineering"
priority: normal
status: done
related_design_doc: "docs/brain-game-score-features-detailed-design.md"
---

# ランキング計算ロジック修正（正規化 → 20代平均基準換算）

## 内容
`lib/scores.ts` の `getOverallRanking()` 関数を刷新。
旧方式（全プレイヤーの最大・最小で正規化）を廃止し、
`lib/game-points.ts` と同じ「20代平均基準で1〜20点換算・5種目最大100点」方式に統一する。

## 設計参照
- 設計書セクション: 詳細設計書 > 総合ランキング
- 関連ファイル: `lib/scores.ts`, `lib/game-points.ts`, `app/rankings/page.tsx`

## 変更内容
### lib/scores.ts
```typescript
// 追加する定数
const POINTS_REF: Record<GameId, number> = {
  calculation: 17,
  "memory-number": 8,
  stroop: 23,
  reaction: 220,
  pattern: 18,
};

// getOverallRanking() の計算ロジックを game-points.ts の換算方式に統一
```

### app/rankings/page.tsx
- 説明文: 「各種目のスコアを正規化して合算したポイント順」→「各種目のスコアを20代平均基準で換算した合計点順（最大100点）」
- 単位表示: 「pt」→「/ 100点」

## 完了条件
- [x] `lib/scores.ts` の `getOverallRanking()` が20代平均基準換算で計算される
- [x] `lib/game-points.ts` の `calcGamePoint()` と同じ換算式を使用
- [x] `app/rankings/page.tsx` の説明テキストが更新されている
- [x] ランキングページで総合スコアが最大100点で表示される
- [x] 既存のプレイ履歴データで正しく動作する

## メモ
- 完了: 2026-05-11
- `game-points.ts` との二重実装を避けるため scores.ts 内に POINTS_REF を定義
