# Company - ClaudeProject 実行チーム

## オーナープロフィール

- **プロジェクト**: BrainGame
- **目的・ゴール**: 脳トレ Web アプリの継続開発・機能改修・品質改善
- **ClaudeCompany 設計資源**: なし
- **作成日**: 2026-05-11

## 組織構成

```
.company/
├── CLAUDE.md
├── secretary/{CLAUDE.md, inbox/, todos/, notes/}
├── pm/{CLAUDE.md, projects/, tickets/}
├── engineering/{CLAUDE.md, docs/, debug-log/}
└── research/{CLAUDE.md, topics/}
```

## 部署一覧

| 部署 | フォルダ | 役割 |
|------|---------|------|
| 秘書室 | secretary | 窓口・TODO 管理・壁打ち・意思決定ログ |
| PM | pm | プロジェクト進捗、チケット管理、ClaudeCompany 設計資源の受け入れ |
| 開発 | engineering | 設計書・実装・テスト・デバッグ |
| リサーチ | research | 技術調査・補完調査 |

## 運営ルール

- 秘書が常に窓口
- ユーザーは部署を意識しなくてよい
- 設計→実装→テストのサイクルは自律的に回す
- 意思決定・学び・アイデアは言われなくても記録する
- 同日同名ファイルは追記。新規作成しない
- ファイル操作前に今日の日付を確認
- 日次ファイル: `YYYY-MM-DD.md`、トピックファイル: `kebab-case.md`

## TODO 形式

```
- [ ] タスク | 優先度: 高/通常/低 | 期限: YYYY-MM-DD
- [x] 完了タスク | 完了: YYYY-MM-DD
```

## パーソナライズメモ

ClaudeCompany（上流：要件・設計）と ClaudeProject（下流：実行）の役割分担を前提とする。
設計資源が持ち込まれたら PM の `projects/` に取り込み、チケット分解 → 開発展開のフローで動く。
