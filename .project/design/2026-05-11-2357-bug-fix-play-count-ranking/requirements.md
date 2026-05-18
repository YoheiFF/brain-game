---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
phase: design
document: requirements
created: "2026-05-11"
---

# 要件定義書: プレイ回数・ランキング・統計 3バグ修正

## 1. 背景・目的

BrainGame アプリ（Next.js + Capacitor Android）において、以下の3つのバグが確認されている。

| バグID | 症状 | 主な発生条件 |
|--------|------|-------------|
| BUG-1 | 残りプレイ回数が減らないことがある | localStorage クリア後・アプリ再インストール後・別デバイス |
| BUG-2 | ランキング/統計ページに遷移して戻ると残り回数が復活する | ランキングページへの遷移後にホームへ戻った場合 |
| BUG-3 | スコアがランキング・統計に反映されない | Capacitor Android ビルドでのゲームプレイ後 |

これら3バグを根本解決し、Capacitor Android ビルドおよびWebブラウザ環境の双方で正しく動作させることを目的とする。

## 2. 問題の根本原因

### BUG-1 / BUG-2 の根本原因

`hooks/useDbSync.ts` の `fetchData` 関数が `/api/sync` レスポンスの `dailyPlays` フィールドを受信しているにもかかわらず、`localStorage` の `braingame_daily`（プレイ回数管理キー）に書き戻す処理が存在しない。

その結果、localStorage をクリアした状態・別デバイス・アプリ再インストール後に DB 上では当日のプレイ済みカウントがあっても、クライアントは「残り3回」と表示してしまう。

### BUG-3 の根本原因

`lib/scores.ts` の `saveScore()` 関数が `recordScore` を **Next.js Server Action**（`"use server"` 関数）として呼び出している。Capacitor Android ビルドでは `capacitor://localhost` オリジンから Server Action への POST リクエストが CORS ポリシーでブロックされる。`/api/sync` には `ALLOWED_ORIGINS` による CORS ヘッダーが設定されているが、Server Action エンドポイントには CORS 設定が存在しない。

また `app/stats/page.tsx` は `useDbSync` を使用していないため、DB との同期が行われず、別デバイスやアプリ再起動後に統計が反映されない。

## 3. 修正要件

### REQ-1: Server Action を API Route に変換（BUG-3 主因の解消）

- `app/actions/user.ts` の `recordScore` 関数のロジックを引き継ぐ新しい API Route `/api/record-score` を作成する
- `/api/record-score` は POST メソッドを受け付け、`/api/sync` と同一パターンの CORS ヘッダーを付与する
- `lib/scores.ts` の `saveScore()` 内の fire-and-forget 呼び出しを、Server Action import から `fetch('/api/record-score', { method: 'POST', ... })` に変更する
- 既存の `app/actions/user.ts` の `recordScore` 関数は **削除しない**（他から参照されている可能性を考慮し、内部で `/api/record-score` を呼ぶ形に変更することも可）

### REQ-2: useDbSync で dailyPlays を localStorage に書き戻す（BUG-1・2 の解消）

- `hooks/useDbSync.ts` の `fetchData` 関数において、`/api/sync` レスポンスの `dailyPlays` を `braingame_daily`（`DailyRecord` 型）の `plays` および `bestScores` フィールドに反映する
- 書き戻す際は必ず今日の日付チェックを行い、古い日付のデータを上書きしない
- DB の値がクライアントより大きい（より多くプレイ済み）場合のみ上書きする（DB 値を「正」として採用）
- 既存の `braingame_scores` / `braingame_rankings` の書き込みロジックを壊さない

### REQ-3: 統計ページに useDbSync を追加（BUG-3 の補完）

- `app/stats/page.tsx` に `useDbSync({ interval: null })` を追加し、マウント時に一度だけ DB から最新データを取得する
- DB データ取得後、setState を呼び直して画面表示を最新の localStorage 値に更新する

## 4. 非機能要件

- Capacitor Android（`capacitor://localhost` オリジン）および Web ブラウザ（`http://localhost:*`）の双方で動作すること
- 既存の `ALLOWED_ORIGINS` 設定を踏襲し、`capacitor://localhost` と `http://localhost` を許可する
- API Route のエラー時はコンソールに警告を出力し、ゲームプレイ体験を阻害しない（fire-and-forget パターンを維持）
- localStorage の既存データ構造（`braingame_scores`, `braingame_rankings`, `braingame_daily`）の形式を変更しない

## 5. 対象外（スコープ外）

- BUG-1 の追加原因である「DB 書き込み失敗時の localStorage との乖離」に対するリトライキュー実装（優先度低）
- `gameEndedRef` による二重実行防止の全ゲームへの統一（優先度低）
- `app/actions/user.ts` の `recordScore` Server Action 本体の削除（安全のため今回は対象外）

## 6. 完了条件

1. Capacitor Android ビルドでゲームプレイ後、ランキングページに自分のスコアが反映される
2. ランキングページ遷移後にホームへ戻っても残りプレイ回数が復活しない
3. アプリ再起動後（localStorage クリア後）に useDbSync が DB のプレイ数を反映し、残り回数が正しく表示される
4. 統計ページに遷移すると DB の最新データが反映される
5. Web ブラウザ環境での動作が従来と変わらない
