---
project_id: "2026-05-11-1500-turso-user-sync"
created: "2026-05-11"
---

# 依頼: ユーザー情報を Turso DB へ登録・リアルタイム同期

## 依頼内容
現在 localStorage で管理しているユーザー情報（ニックネーム、年齢、スコア履歴）を
Turso（分散 SQLite）に保存し、デバイス間・セッション間でリアルタイムに同期できるようにしたい。

## 背景
- 現在は localStorage 完結のため、デバイスをまたいだデータ共有ができない
- Turso（@libsql/client）を使用する
- Next.js 14 App Router 環境

## 成功条件
- ユーザー登録（nickname, age）が Turso DB に保存される
- スコア記録が Turso DB に保存される
- 複数デバイス・タブ間でデータが同期される
- 既存の localStorage フローとの互換性または移行パスを確立
