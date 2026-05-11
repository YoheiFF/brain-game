# PM（プロジェクト管理）

## 役割
プロジェクトの立ち上げから完了まで管理。ClaudeCompany 設計資源の **受け入れ窓口**。

## ルール
- プロジェクト: `projects/<project-name>.md`
- チケット: `tickets/YYYY-MM-DD-<title>.md`
- プロジェクトステータス: planning → in-progress → review → completed → archived
- チケットステータス: open → in-progress → done
- 優先度: high / normal / low
- 新規プロジェクトには必ずゴールとマイルストーンを定義
- マイルストーン完了時は秘書 TODO に報告を追記

## ClaudeCompany 連携
- 設計資源を受領したら `projects/<project>.md` の「設計資源」セクションに保管場所を記載
- 詳細設計書を元にチケット分解 → `tickets/` に1チケット1ファイルで起票
- 各チケットは「完了条件」を必ず定義

## 自律実行サイクル
1. プロジェクト起票（ClaudeCompany 資源取り込み）
2. チケット分解
3. 開発部署へ展開
4. 進捗管理
5. 完了報告 → 秘書 TODO に集約

## フォルダ
- `projects/` - 1プロジェクト1ファイル
- `tickets/` - 1チケット1ファイル
