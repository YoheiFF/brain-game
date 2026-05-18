---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
phase: engineering
---
# 実装ログ

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| `app/api/record-score/route.ts` | 新規作成 | ✅ | Capacitor CORS 対応 API Route |
| `lib/scores.ts` | 編集（行 91-98） | ✅ | Server Action → fetch に変更 |
| `hooks/useDbSync.ts` | 全体書き換え | ✅ | mergeDailyPlaysToStorage 追加 |
| `app/stats/page.tsx` | 編集 | ✅ | useDbSync + syncData useEffect 追加 |

## ファイル別詳細

### app/api/record-score/route.ts（新規作成）
- **操作**: 新規作成
- **実装内容**:
  - `OPTIONS` ハンドラ: Preflight 対応、204 + CORS ヘッダー返却
  - `POST` ハンドラ: JSON パース → バリデーション（userId/gameId/score） → DB 1日上限チェック → saveScoreToDb / recordDailyPlay / updateDailyHistory 直列実行
  - `ALLOWED_ORIGINS`: `["capacitor://localhost", "http://localhost"]`
  - `Access-Control-Allow-Methods`: `"POST, OPTIONS"`
  - 全レスポンスに CORS ヘッダー付与（エラー時も）
- **設計との差異**: なし

### lib/scores.ts（編集）
- **操作**: 行 91-98 の Server Action 呼び出しを fetch に変換
- **実装内容**:
  - `import("@/app/actions/user").then(...)` を削除
  - `fetch("/api/record-score", { method: "POST", ... }).catch(...)` に置き換え
  - fire-and-forget パターン維持（`.catch` のみ、`.then` なし）
- **設計との差異**: なし

### hooks/useDbSync.ts（全体書き換え）
- **操作**: 全体を詳細設計書のコードブロックで書き換え
- **実装内容**:
  - `todayString()` 関数追加（lib/daily.ts の today() と同一実装、循環インポート回避）
  - `DailyRecord` インターフェース定義追加
  - `mergeDailyPlaysToStorage(dailyPlays)` 関数追加:
    - `braingame_daily` を JSON パース → 日付チェック → 空 DailyRecord にフォールバック
    - DB の playCount > ローカルの playCount の場合のみ上書き
    - DB の bestScore !== null の場合 bestScores を DB 値で上書き
    - `changed` フラグが true の場合のみ localStorage.setItem 実行
  - `fetchData` 内で `json.dailyPlays` 存在確認後に `mergeDailyPlaysToStorage` 呼び出し
  - 既存の `braingame_scores` / `braingame_rankings` 書き込みロジックを維持
- **設計との差異**: なし

### app/stats/page.tsx（編集）
- **操作**: import 追加 + フック追加 + useEffect 追加
- **実装内容**:
  - `import { useDbSync } from "@/hooks/useDbSync"` を import セクション末尾に追加
  - `const { data: syncData } = useDbSync({ interval: null })` を `const [tab, setTab]` 直後に追加
  - `syncData` 依存の `useEffect` を既存の `useEffect` 直後に追加:
    - `setBests(getAllPersonalBests())`
    - `setDailyBests(getDailyBests())`
    - `setTotalPlays(getTotalPlayCount())`
  - 他の JSX・ロジックは変更なし
- **設計との差異**: なし

## TypeScript チェック結果

```
$ npx tsc --noEmit
（出力なし = エラー 0 件）
```

型エラーなし。全ファイルのコンパイルが正常に完了。

## 全体サマリー

詳細設計書の 4 ファイル・3 バグ修正を設計通りに実装した。

| バグ | 修正内容 | 対応ファイル |
|------|----------|------------|
| BUG-1: 残りプレイ回数が減らない | `mergeDailyPlaysToStorage` で DB のプレイ数を localStorage に書き戻すよう修正 | hooks/useDbSync.ts |
| BUG-2: ランキング遷移後に残り回数が復活 | BUG-1 と同じ修正で対応（useDbSync による DB 同期で localStorage を上書き） | hooks/useDbSync.ts |
| BUG-3: スコアがランキング・統計に未反映 | Server Action を CORS 対応 API Route に変換 + stats ページに useDbSync 追加 | app/api/record-score/route.ts, lib/scores.ts, app/stats/page.tsx |

TypeScript コンパイルエラー: 0 件
