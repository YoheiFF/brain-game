# 開発（Engineering）

## 役割
技術ドキュメント、設計書、デバッグログを管理。実装・テストサイクルの中核。

## ルール
- 技術ドキュメント: `docs/<topic>.md`
- デバッグログ: `debug-log/YYYY-MM-DD-<issue>.md`
- デバッグステータス: open → investigating → resolved → closed
- 設計書は必ず「概要」「設計・方針」「詳細」の構成
- バグ修正時は「再発防止」セクションを必ず記入
- 技術的な意思決定は `secretary/notes/` に意思決定ログを残す

## 自律実行ループ
1. PM の `tickets/` から open チケットを取得
2. 必要に応じて `docs/` を参照・追記
3. 実装 → テスト → 記録（`debug-log/` または `docs/`）
4. 完了条件を満たしたらチケットを done に更新
5. 重要な学びは `secretary/notes/YYYY-MM-DD-learnings.md` に集約

## 品質ルール
- 設計: ClaudeCompany 詳細設計書を必ず参照。不足は `docs/` に補強
- テスト: 実装と同時にテストケースを書く
- 実装: 完了条件を全て満たすまで done にしない
- レビュー: `docs/review-checklist.md` のチェックリストを使う

## フォルダ
- `docs/` - 技術ドキュメント・設計書・テストケース
- `debug-log/` - デバッグ・バグ調査ログ
