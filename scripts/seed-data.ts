import { createClient } from "@libsql/client/web";
import * as dotenv from "dotenv";
import { randomUUID } from "crypto";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("環境変数 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定です");
  process.exit(1);
}

const db = createClient({ url, authToken });

const USERS = [
  { nickname: "たろう",     age: 24 },
  { nickname: "はなこ",     age: 31 },
  { nickname: "けんじ",     age: 19 },
  { nickname: "さくら",     age: 27 },
  { nickname: "りょう",     age: 22 },
  { nickname: "みき",       age: 35 },
  { nickname: "だいき",     age: 18 },
  { nickname: "あいな",     age: 29 },
  { nickname: "こうた",     age: 42 },
  { nickname: "ゆうな",     age: 23 },
  { nickname: "しんや",     age: 16 },
  { nickname: "なな",       age: 33 },
  { nickname: "はると",     age: 21 },
  { nickname: "みお",       age: 26 },
  { nickname: "りく",       age: 38 },
];

// ゲームごとのスコア範囲 [min, max]（lowerIsBetter: reaction のみ）
const SCORE_RANGES: Record<string, [number, number]> = {
  calculation:     [8,  35],
  "memory-number": [3,  14],
  stroop:          [10, 40],
  reaction:        [150, 420], // lowerIsBetter
  pattern:         [4,  24],
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isoNow(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

async function seed() {
  console.log("シードデータを投入中...\n");

  for (const u of USERS) {
    const userId = randomUUID();
    const now = isoNow();

    // users テーブル
    await db.execute({
      sql: `INSERT OR IGNORE INTO users (id, nickname, age, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [userId, u.nickname, u.age, now, now],
    });

    // 各ゲームのスコアを 1〜3 件投入
    for (const [gameId, [min, max]] of Object.entries(SCORE_RANGES)) {
      const plays = randInt(1, 3);
      for (let p = 0; p < plays; p++) {
        const score = randInt(min, max);
        const daysAgo = randInt(0, 14);
        await db.execute({
          sql: `INSERT INTO scores (user_id, game_id, score, created_at) VALUES (?, ?, ?, ?)`,
          args: [userId, gameId, score, isoNow(daysAgo)],
        });
      }
    }

    console.log(`✅ ${u.nickname}（${u.age}歳）のデータを投入`);
  }

  console.log(`\n完了: ${USERS.length} ユーザー分のデータを投入しました`);
}

seed().catch((e) => {
  console.error("シード失敗:", e);
  process.exit(1);
});
