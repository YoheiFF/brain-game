import "server-only";
import { getDb } from "@/lib/db";
import type { FriendEntry, PendingRequest } from "@/lib/db-types";

const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIEND_CODE_LENGTH = 6;
const MAX_FRIENDS = 50;
const MAX_RETRY = 5;

export class FriendError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'SELF_REQUEST' | 'ALREADY_EXISTS' | 'LIMIT_EXCEEDED',
    public readonly httpStatus: number,
    message?: string
  ) {
    super(message ?? code);
  }
}

function generateFriendCode(): string {
  const array = new Uint8Array(FRIEND_CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => FRIEND_CODE_CHARS[b % FRIEND_CODE_CHARS.length])
    .join('');
}

async function ensureUniqueFriendCode(db: Awaited<ReturnType<typeof getDb>>): Promise<string> {
  for (let i = 0; i < MAX_RETRY; i++) {
    const code = generateFriendCode();
    const result = await db.execute({
      sql: 'SELECT id FROM users WHERE friend_code = ?',
      args: [code],
    });
    if (result.rows.length === 0) return code;
  }
  throw new Error('friend code generation failed');
}

export async function getOrCreateFriendCode(userId: string): Promise<string> {
  const db = await getDb();

  const result = await db.execute({
    sql: 'SELECT friend_code FROM users WHERE id = ?',
    args: [userId],
  });

  if (result.rows.length > 0) {
    const existingCode = result.rows[0].friend_code as string | null;
    if (existingCode !== null) return existingCode;
  }

  const newCode = await ensureUniqueFriendCode(db);
  const now = new Date().toISOString();
  await db.execute({
    sql: 'UPDATE users SET friend_code = ?, updated_at = ? WHERE id = ?',
    args: [newCode, now, userId],
  });

  return newCode;
}

export async function getFriendsByUserId(userId: string): Promise<FriendEntry[]> {
  const db = await getDb();

  const result = await db.execute({
    sql: `SELECT
      CASE
        WHEN f.requester_id = ? THEN f.addressee_id
        ELSE f.requester_id
      END AS friend_id,
      u.nickname,
      u.friend_code
    FROM friendships f
    JOIN users u ON u.id = (
      CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    )
    WHERE (f.requester_id = ? OR f.addressee_id = ?)
      AND f.status = 'accepted'
    LIMIT 50`,
    args: [userId, userId, userId, userId],
  });

  return result.rows.map((row) => ({
    userId: row.friend_id as string,
    nickname: row.nickname as string,
    friendCode: row.friend_code as string | null,
  }));
}

export async function getPendingRequests(userId: string): Promise<PendingRequest[]> {
  const db = await getDb();

  const result = await db.execute({
    sql: `SELECT f.requester_id, u.nickname AS requester_nickname, f.created_at
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    requesterId: row.requester_id as string,
    requesterNickname: row.requester_nickname as string,
    createdAt: row.created_at as string,
  }));
}

export async function sendFriendRequest(
  userId: string,
  friendCode: string
): Promise<{ addresseeId: string; addresseeNickname: string }> {
  const db = await getDb();

  // 対象ユーザーを検索
  const addresseeResult = await db.execute({
    sql: 'SELECT id, nickname FROM users WHERE UPPER(friend_code) = UPPER(?)',
    args: [friendCode],
  });

  if (addresseeResult.rows.length === 0) {
    throw new FriendError('NOT_FOUND', 404);
  }

  const addressee = {
    id: addresseeResult.rows[0].id as string,
    nickname: addresseeResult.rows[0].nickname as string,
  };

  // 自分自身への申請チェック
  if (addressee.id === userId) {
    throw new FriendError('SELF_REQUEST', 400);
  }

  // フレンド数上限チェック
  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM friendships
    WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`,
    args: [userId, userId],
  });
  const friendCount = countResult.rows[0].cnt as number;
  if (friendCount >= MAX_FRIENDS) {
    throw new FriendError('LIMIT_EXCEEDED', 400);
  }

  // 既存の friendships 行を検索（双方向チェック）
  const existingResult = await db.execute({
    sql: `SELECT id, status FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)`,
    args: [userId, addressee.id, addressee.id, userId],
  });

  if (existingResult.rows.length > 0) {
    const existingStatus = existingResult.rows[0].status as string;

    if (existingStatus === 'pending' || existingStatus === 'accepted') {
      throw new FriendError('ALREADY_EXISTS', 409);
    }

    // status=rejected の場合: UPDATE（再申請を許可）
    if (existingStatus === 'rejected') {
      const existingId = existingResult.rows[0].id as number;
      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE friendships SET requester_id = ?, addressee_id = ?, status = 'pending', updated_at = ? WHERE id = ?`,
        args: [userId, addressee.id, now, existingId],
      });
      return { addresseeId: addressee.id, addresseeNickname: addressee.nickname };
    }
  }

  // INSERT
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO friendships (requester_id, addressee_id, status, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?)`,
    args: [userId, addressee.id, now, now],
  });

  return { addresseeId: addressee.id, addresseeNickname: addressee.nickname };
}

export async function respondToFriendRequest(
  userId: string,
  requesterId: string,
  action: 'accept' | 'reject'
): Promise<void> {
  const db = await getDb();

  const result = await db.execute({
    sql: `SELECT id FROM friendships
    WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`,
    args: [requesterId, userId],
  });

  if (result.rows.length === 0) {
    throw new FriendError('NOT_FOUND', 404);
  }

  const id = result.rows[0].id as number;
  const now = new Date().toISOString();

  if (action === 'accept') {
    await db.execute({
      sql: `UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?`,
      args: [now, id],
    });
  } else {
    await db.execute({
      sql: `UPDATE friendships SET status = 'rejected', updated_at = ? WHERE id = ?`,
      args: [now, id],
    });
  }
}

export async function getFriendIds(userId: string): Promise<string[]> {
  const db = await getDb();

  const result = await db.execute({
    sql: `SELECT
      CASE
        WHEN requester_id = ? THEN addressee_id
        ELSE requester_id
      END AS friend_id
    FROM friendships
    WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`,
    args: [userId, userId, userId],
  });

  return result.rows.map((row) => row.friend_id as string);
}
