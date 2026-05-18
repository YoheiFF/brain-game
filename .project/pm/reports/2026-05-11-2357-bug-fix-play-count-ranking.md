---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
created: "2026-05-12"
status: completed
overall_qa: pass
---

# PM最終報告: プレイ回数・ランキング・統計 3バグ修正

## 総合判定: pass（全25チェック項目PASS・型エラー0件）

---

## 【依頼】
- 残りプレイ回数が減らないことがある
- ランキング/統計画面に遷移して戻ると残り回数が3に復活する
- ランキングと統計にプレイ結果が反映されない

---

## 【情報収集 主要発見】
1. Server ActionはCapacitor Android（`capacitor://localhost`）からCORSブロックされていた（バグ3主因）
2. `useDbSync`がDBの`dailyPlays`を`localStorage`に書き戻していなかった（バグ1・2主因）
3. 統計ページ（stats）は`useDbSync`を使用しておらずDB同期が皆無だった（バグ3補完）

---

## 【設計・実装】
影響範囲: 4ファイル

| ファイル | 変更種別 | 対応バグ |
|---------|---------|---------|
| `app/api/record-score/route.ts` | 新規作成 | BUG-3 |
| `lib/scores.ts` | 編集 | BUG-3 |
| `hooks/useDbSync.ts` | 編集 | BUG-1, BUG-2 |
| `app/stats/page.tsx` | 編集 | BUG-3補完 |

---

## 【テスト】
総合判定: **pass**（TypeScript エラー 0件・全チェック項目PASS）

---

## 【残課題】
- 日付判定がUTC基準（`toISOString().slice(0,10)`）とローカル時刻基準（`lib/daily.ts`）で微妙にズレる可能性あり（JST深夜帯に影響）。既存 `/api/sync` と同一挙動のため今回スコープ外。
- `recordScore`の1日上限はDB基準のため、localStorage消去後にDB上限に達していると保存できない（意図した挙動）。

---

## 【デプロイ状況】
- GitHub: `91f0b4a` プッシュ済み
- Vercel: 自動デプロイにより `https://brain-game-opal.vercel.app` に反映予定
- Android APK: Vercel経由のため再ビルド不要
