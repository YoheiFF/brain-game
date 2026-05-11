import { createClient } from "@libsql/client/web";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("環境変数 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定です");
  process.exit(1);
}

const db = createClient({ url, authToken });

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    age INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_game_id ON scores(game_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id)`,
  `CREATE TABLE IF NOT EXISTS daily_plays (
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    play_date TEXT NOT NULL,
    play_count INTEGER DEFAULT 0,
    best_score REAL,
    PRIMARY KEY (user_id, game_id, play_date)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_history (
    user_id TEXT NOT NULL,
    play_date TEXT NOT NULL,
    total_points INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, play_date)
  )`,
];

async function migrate() {
  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
    console.log("OK:", sql.slice(0, 50));
  }
  console.log("マイグレーション完了");
}

migrate().catch((e) => {
  console.error("マイグレーション失敗:", e);
  process.exit(1);
});
