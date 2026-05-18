---
project_id: "2026-05-18-1100-friend-feature"
phase: qa
created: "2026-05-18"
tester: Claude Code (claude-sonnet-4-6)
verdict: pass
---

# テストレポート: フレンド機能

## 総合判定: PASS

全10観点でパス。TypeScript 静的検証もエラーなし。

---

## 1. TypeScript 型チェック

| 項目 | 結果 | 詳細 |
|---|---|---|
| `npx tsc --noEmit` | PASS | エラー出力なし（exit code 0） |

---

## 2. `lib/db.ts` マイグレーションの冪等性

| 項目 | 結果 | 詳細 |
|---|---|---|
| `getDb()` の async 化 | PASS | `export async function getDb(): Promise<Client>` |
| シングルトン制御 | PASS | `client && migrationDone` の両方を確認してから早期 return |
| `friend_code` カラム追加の冪等性 | PASS | `ALTER TABLE` を `try/catch` でラップし、重複カラムエラーを無視 |
| `friendships` テーブル作成の冪等性 | PASS | `CREATE TABLE IF NOT EXISTS` を使用 |
| インデックス作成の冪等性 | PASS | `CREATE INDEX IF NOT EXISTS` を2本とも使用 |
| `migrationDone` フラグ | PASS | マイグレーション完了後に `true` をセット、以降はスキップ |

**設計との差異**: なし

---

## 3. フレンドコード生成ロジック（`lib/db-friends.ts`）

| 項目 | 結果 | 詳細 |
|---|---|---|
| 文字セット（32文字） | PASS | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（O/0/I/1/l を除外した32文字） |
| 文字数（6文字） | PASS | `FRIEND_CODE_LENGTH = 6` |
| 乱数生成 | PASS | `crypto.getRandomValues(new Uint8Array(6))` を使用 |
| バイトマッピング | PASS | `FRIEND_CODE_CHARS[b % FRIEND_CODE_CHARS.length]` |
| 衝突リトライ上限 | PASS | `MAX_RETRY = 5`、5回失敗で `throw new Error('friend code generation failed')` |
| 衝突チェックSELECT | PASS | `SELECT id FROM users WHERE friend_code = ?` で存在確認 |
| NULL時の自動生成・DB保存 | PASS | `UPDATE users SET friend_code = ?, updated_at = ? WHERE id = ?` |

**設計との差異**: なし

---

## 4. API 5本の存在と CORS ヘッダー

| エンドポイント | ファイル存在 | OPTIONS実装 | CORS ヘッダー | 結果 |
|---|---|---|---|---|
| `GET /api/friends` | PASS | PASS | PASS | PASS |
| `POST /api/friends/request` | PASS | PASS | PASS | PASS |
| `POST /api/friends/respond` | PASS | PASS | PASS | PASS |
| `GET /api/friends/pending` | PASS | PASS | PASS | PASS |
| `GET /api/friends/ranking` | PASS | PASS | PASS | PASS |

全APIで `getCorsHeaders()` 関数を定義し、`OPTIONS` ハンドラおよび各レスポンスのヘッダーに適用している。
CORS 許可オリジン: `capacitor://localhost`, `http://localhost`

---

## 5. `POST /api/friends/request` の実装

| 項目 | 結果 | 詳細 |
|---|---|---|
| フレンドコードによる申請 | PASS | `sendFriendRequest(userId, normalizedCode)` を呼び出し |
| 大文字正規化 | PASS | `friendCode.toUpperCase().trim()` で正規化してから渡す |
| UUID バリデーション | PASS | `UUID_REGEX.test(userId)` で検証 |
| 空フレンドコードの弾き | PASS | `!friendCode || friendCode.trim() === ""` で 400 |
| `FriendError` のエラーマッピング | PASS | NOT_FOUND→404、SELF_REQUEST→400、ALREADY_EXISTS→409、LIMIT_EXCEEDED→400 |
| 成功レスポンス | PASS | `{ success: true, addresseeNickname }` |

**設計との差異**: なし

---

## 6. `POST /api/friends/respond` の実装

| 項目 | 結果 | 詳細 |
|---|---|---|
| accept 処理 | PASS | `respondToFriendRequest(userId, requesterId, "accept")` → `status='accepted'` にUPDATE |
| reject 処理 | PASS | `respondToFriendRequest(userId, requesterId, "reject")` → `status='rejected'` にUPDATE |
| userId UUID バリデーション | PASS | UUID_REGEX で検証 |
| requesterId UUID バリデーション | PASS | UUID_REGEX で検証 |
| action バリデーション | PASS | `action !== "accept" && action !== "reject"` で 400 |
| pending の存在チェック | PASS | `SELECT id FROM friendships WHERE requester_id=? AND addressee_id=? AND status='pending'` |
| 申請不在時 404 | PASS | `FriendError` キャッチで 404 `{ error: "申請が見つかりません" }` |
| 成功レスポンス | PASS | `{ success: true }` |

**設計との差異**: なし

---

## 7. `GET /api/friends/ranking` のフレンド+自分スコア返却

| 項目 | 結果 | 詳細 |
|---|---|---|
| `getFriendIds(userId)` 呼び出し | PASS | フレンドID一覧を取得 |
| `getFriendRankingsFromDb(userId, friendIds)` 呼び出し | PASS | `allIds = [userId, ...friendIds]` で自分を含む |
| WHERE句での絞り込み | PASS | `WHERE s.user_id IN (${placeholders})` にて自分+フレンドのみ |
| フレンド0人時の自分のみランキング | PASS | `friendIds` が空配列でも `allIds = [userId]` で自分だけのランキングを返す |
| `{ gameRankings, overallRanking }` 返却 | PASS | 設計通りのレスポンス構造 |

**設計との差異**: なし

---

## 8. `app/friends/page.tsx` のフレンドコード表示・シェア機能

| 項目 | 結果 | 詳細 |
|---|---|---|
| フレンドコード表示 | PASS | `<p className="text-3xl font-mono ...">` で大きめフォント・等幅表示 |
| コピーボタン | PASS | `navigator.clipboard.writeText(myCode)` を呼び出し、2秒後リセット |
| シェアボタン | PASS | `handleShare()` 関数が実装済み |
| `navigator.share` 対応 | PASS | 利用可能時はネイティブシェアシート |
| LINE フォールバック | PASS | 利用不可時は `line.me/R/share?text=...` を `window.open` |
| シェアテキストにコードとURL | PASS | `フレンドコード: ${friendCode}\n${APP_URL}/add-friend?code=${friendCode}` |
| Server Action 経由でコード取得 | PASS | `getMyFriendCode(uid)` （`app/actions/friends.ts`）を呼び出し |
| 受信申請の承認・拒否ボタン | PASS | `handleRespond(requesterId, "accept"|"reject")` |
| フレンドランキングへのリンク | PASS | `<Link href="/friends/ranking">` |

**設計との差異**: なし

---

## 9. `app/add-friend/page.tsx` の ?code=xxx 処理

| 項目 | 結果 | 詳細 |
|---|---|---|
| `useSearchParams()` 使用 | PASS | `searchParams.get("code") ?? ""` |
| Suspense ラップ | PASS | `AddFriendContent` を `<Suspense>` でラップして静的ビルド警告を回避 |
| 初期値の大文字化 | PASS | `useState(codeFromUrl.toUpperCase())` |
| 入力時の自動大文字変換 | PASS | `setCode(e.target.value.toUpperCase().slice(0, 6))` |
| 申請ボタン活性条件 | PASS | `disabled={code.length !== 6 ...}` |
| 成功後のリダイレクト | PASS | `router.push("/friends")` （1.5秒後） |
| `POST /api/friends/request` 呼び出し | PASS | `fetch("/api/friends/request", { method: "POST", ... })` |

**設計との差異**: なし

---

## 10. `app/page.tsx` のフレンドページリンク

| 項目 | 結果 | 詳細 |
|---|---|---|
| フレンドリンクボタンの存在 | PASS | `<Link href="/friends">` が実装済み |
| 表示テキスト | PASS | `👥 フレンド` |
| スタイル | PASS | 設計書通り `bg-green-500/10 ... border-green-500/30 text-green-400` |
| 配置 | PASS | `/rankings` リンクの直後（右上リンクボタン群の末尾） |

**設計との差異**: なし

---

## 追加確認: 設計書記載の周辺ファイル

| ファイル | 確認項目 | 結果 |
|---|---|---|
| `lib/db-scores.ts` | `getFriendRankingsFromDb` の実装 | PASS（設計書の SQL、ロジックと一致） |
| `app/actions/friends.ts` | Server Action ラッパー | PASS（`"use server"` + UUID バリデーション + `getOrCreateFriendCode` 呼び出し） |
| `lib/db-types.ts` | `FriendshipStatus`, `Friendship`, `FriendEntry`, `PendingRequest` 型定義 | PASS（全4型が設計書通りに追加済み） |

---

## 設計書との差異サマリー

| 差異 | 内容 | 評価 |
|---|---|---|
| `sendFriendRequest` のフレンド上限チェック順序 | 設計書では INSERT 前に上限チェックとあるが、実装では上限チェックを既存行チェックの前に実施している | 許容範囲（バグにならない。むしろ早期リターンで効率的） |
| `app/friends/ranking/page.tsx` の空状態分岐 | 設計書は「フレンド0人・自分のみの場合」に空状態を出すとあるが、実装は `GET /api/friends` のレスポンスを基に `hasFriends` フラグで分岐 | 設計書 5-15 の「フレンド0人の場合は空状態」の意図に合致。PASS |

---

## 未実装・欠落項目

なし（全観点でパス）

---

## 総合判定: **PASS**

- TypeScript 静的検証: エラーなし
- 設計書記載の全ファイル（API 5本、フロントエンド 3ページ、ライブラリ 3ファイル）が実装済み
- 設計書の観点（マイグレーション冪等性、コード生成ロジック、CORS、エラーハンドリング、UI要件）をすべて満たしている
