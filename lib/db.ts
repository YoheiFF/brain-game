import "server-only";
import { createClient, type Client } from "@libsql/client/web";

let client: Client | null = null;
let migrationDone = false;

export async function getDb(): Promise<Client> {
  if (client && migrationDone) return client;

  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error(
        "[BrainGame] TURSO_DATABASE_URL または TURSO_AUTH_TOKEN が未設定です。" +
        ".env.local を確認してください。"
      );
    }

    client = createClient({
      url,
      authToken,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        return fetch(input, { ...init, signal: controller.signal }).finally(() =>
          clearTimeout(timeoutId)
        );
      },
    });
  }

  if (!migrationDone) {
    // --- マイグレーション: friend_code カラム ---
    // SQLite は ADD COLUMN に UNIQUE 制約を付けられないため、カラム追加とインデックス作成を分ける
    try {
      await client.execute(
        "ALTER TABLE users ADD COLUMN friend_code TEXT"
      );
    } catch {
      // "duplicate column name" は無視（既に存在する）
    }
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code) WHERE friend_code IS NOT NULL"
    );

    // --- マイグレーション: friendships テーブル ---
    await client.execute(`
      CREATE TABLE IF NOT EXISTS friendships (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id TEXT NOT NULL,
        addressee_id TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        UNIQUE(requester_id, addressee_id)
      )
    `);
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id)"
    );

    // --- マイグレーション: referral_bonus カラム ---
    try {
      await client.execute(
        "ALTER TABLE users ADD COLUMN referral_bonus INTEGER NOT NULL DEFAULT 0"
      );
    } catch {
      // "duplicate column name" は無視（既に存在する）
    }

    // --- マイグレーション: referrals テーブル ---
    await client.execute(`
      CREATE TABLE IF NOT EXISTS referrals (
        id          TEXT PRIMARY KEY,
        referrer_id TEXT NOT NULL,
        referred_id TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        UNIQUE(referred_id)
      )
    `);
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)"
    );

    migrationDone = true;
  }

  return client;
}
