import { getDb } from "@/lib/db";
import type { User } from "@/lib/db-types";

export async function getUser(userId: string): Promise<User | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, nickname, age, created_at, updated_at FROM users WHERE id = ?",
    args: [userId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id as string,
    nickname: row.nickname as string,
    age: row.age as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getOrCreateUser(user: {
  id: string;
  nickname: string;
  age: number | null;
}): Promise<User> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: "INSERT OR IGNORE INTO users (id, nickname, age, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [user.id, user.nickname, user.age, now, now],
  });

  const created = await getUser(user.id);
  if (!created) {
    throw new Error(`[BrainGame] getOrCreateUser: user ${user.id} not found after insert`);
  }
  return created;
}

export async function updateUser(
  userId: string,
  updates: { nickname?: string; age?: number | null }
): Promise<void> {
  const hasNickname = updates.nickname !== undefined;
  const hasAge = updates.age !== undefined;

  if (!hasNickname && !hasAge) return;

  const db = await getDb();
  const now = new Date().toISOString();

  if (hasNickname && hasAge) {
    await db.execute({
      sql: "UPDATE users SET nickname = ?, age = ?, updated_at = ? WHERE id = ?",
      args: [updates.nickname!, updates.age!, now, userId],
    });
  } else if (hasNickname) {
    await db.execute({
      sql: "UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?",
      args: [updates.nickname!, now, userId],
    });
  } else {
    await db.execute({
      sql: "UPDATE users SET age = ?, updated_at = ? WHERE id = ?",
      args: [updates.age!, now, userId],
    });
  }
}
