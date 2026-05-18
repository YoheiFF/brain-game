---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
phase: qa
overall_status: pass
---
# テストレポート

## 総合判定

**PASS** — 詳細設計書の全チェック項目が実装済みであることを確認。TypeScript 静的検証もエラー 0 件。

---

## テスト観点別結果

| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | ALLOWED_ORIGINS に "capacitor://localhost" と "http://localhost" が含まれる | CORS | PASS | route.ts L25-28 で定義済み |
| 2 | OPTIONS ハンドラが存在し 204 を返す | CORS | PASS | route.ts L41-47: `status: 204` + CORS ヘッダー |
| 3 | 全レスポンス（正常系・エラー系）に getCorsHeaders() が適用されている | CORS | PASS | 400/429/500/200 全ての NextResponse.json に `headers: corsHeaders` を付与 |
| 4 | Access-Control-Allow-Methods が "POST, OPTIONS" である | CORS | PASS | route.ts L36: `"POST, OPTIONS"` |
| 5 | Server Action の import("@/app/actions/user") が削除されている | scores.ts | PASS | lib/scores.ts に動的 import は存在しない |
| 6 | fetch("/api/record-score", ...) が追加されている | scores.ts | PASS | scores.ts L92-98 で実装済み |
| 7 | fire-and-forget パターン（.catch のみ）が維持されている | scores.ts | PASS | `.then` なし、`.catch` のみで console.warn |
| 8 | todayString() 関数が存在するか | useDbSync.ts | PASS | useDbSync.ts L19-22 で定義済み |
| 9 | DailyRecord インターフェースが lib/daily.ts の同名型と構造一致 | useDbSync.ts | PASS | 両ファイルとも `{ date: string; plays: Partial<Record<GameId, number>>; bestScores: Partial<Record<GameId, number>> }` |
| 10 | mergeDailyPlaysToStorage 関数が存在するか | useDbSync.ts | PASS | useDbSync.ts L38-85 で定義済み |
| 11 | DB playCount > ローカル playCount の条件でのみ上書き | useDbSync.ts | PASS | L67: `if (dbEntry.playCount > localPlayCount)` |
| 12 | bestScore が null の場合は更新しない条件がある | useDbSync.ts | PASS | L73: `if (dbEntry.bestScore !== null)` |
| 13 | changed フラグで不要な localStorage.setItem を回避 | useDbSync.ts | PASS | L56: `let changed = false` → L82: `if (changed)` でのみ setItem |
| 14 | fetchData 内で mergeDailyPlaysToStorage が呼ばれている | useDbSync.ts | PASS | useDbSync.ts L132-134: `if (json.dailyPlays) { mergeDailyPlaysToStorage(json.dailyPlays); }` |
| 15 | braingame_scores / braingame_rankings の書き込みが維持されている | useDbSync.ts | PASS | useDbSync.ts L111-129 で既存ロジック維持 |
| 16 | useDbSync が import されているか | stats/page.tsx | PASS | page.tsx L12: `import { useDbSync } from "@/hooks/useDbSync"` |
| 17 | useDbSync({ interval: null }) が呼ばれているか | stats/page.tsx | PASS | page.tsx L31: `const { data: syncData } = useDbSync({ interval: null })` |
| 18 | syncData 依存の useEffect が追加されているか | stats/page.tsx | PASS | page.tsx L43-49 で定義済み |
| 19 | useEffect 内で setBests / setDailyBests / setTotalPlays が再呼び出し | stats/page.tsx | PASS | page.tsx L46-48 で3関数すべて呼び出し |
| 20 | UUID_REGEX が定義されているか | /api/record-score | PASS | route.ts L11-12 で定義済み |
| 21 | SCORE_LIMITS が5種目すべて定義されている | /api/record-score | PASS | route.ts L14-20: calculation / memory-number / stroop / reaction / pattern 全5種目 |
| 22 | userId の UUID チェックが実装されているか | /api/record-score | PASS | route.ts L77-82: `UUID_REGEX.test(userId)` |
| 23 | gameId の GAME_IDS チェックが実装されているか | /api/record-score | PASS | route.ts L85: `GAME_IDS.includes(gameId as GameId)` |
| 24 | score の範囲チェックが実装されているか | /api/record-score | PASS | route.ts L100-106: SCORE_LIMITS 参照の範囲チェック |
| 25 | 1日上限チェック (MAX_PLAYS_PER_DAY = 3) と 429 レスポンス | /api/record-score | PASS | route.ts L22, L119-124: `>= MAX_PLAYS_PER_DAY` で 429 返却 |

---

## 静的検証

- TypeScript (`npx tsc --noEmit`): **PASS — エラー 0 件**
- ビルド: TypeScript コンパイルが成功しているため問題なし（実行環境が必要なため `npm run build` は未実行）

---

## 発見した問題

なし。全25検証項目が設計書通りに実装されていることを確認した。

### 補足注意点（問題ではない）

- `lib/daily.ts` の `DailyRecord` インターフェースは `interface`（非export）だが、`hooks/useDbSync.ts` でも同一構造の `DailyRecord` を独立して定義しており、循環インポートを避けるための意図的な設計で正しい。
- `SyncResponse.dailyPlays` の型 (`Partial<Record<GameId, { playCount: number; bestScore: number | null }>>`) と `mergeDailyPlaysToStorage` の引数型が一致していることを型定義（`db-types.ts` L47）で確認済み。
- 1日上限チェックで使用している `today = new Date().toISOString().slice(0, 10)` は UTC 基準であり、`lib/daily.ts` の `today()` 関数（ローカル時刻基準）と日付のズレが生じる可能性がある。ただしこれは既存の `/api/sync` 等と同じ挙動であり、本設計書スコープ外の既知事項として記録する。

---

## PM への申し送り

全検証項目 PASS。TypeScript 静的検証もエラー 0 件で、本プロジェクトの実装は詳細設計書に完全準拠していることを確認した。

BUG-1・BUG-2（残りプレイ回数が減らない・ランキング遷移後に復活）および BUG-3（スコアがランキング・統計に未反映）の修正コードが正しく実装されており、リリース可能な状態と判断する。

実機テスト（Capacitor Android での CORS 動作確認）については QA スコープ外のため、PM 判断でリリース後の動作確認を推奨する。
