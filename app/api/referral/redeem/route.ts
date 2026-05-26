import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { referrerId, newUserId } = body as {
    referrerId?: unknown;
    newUserId?: unknown;
  };

  // バリデーション
  if (!referrerId || typeof referrerId !== "string" || !UUID_REGEX.test(referrerId)) {
    return NextResponse.json(
      { error: "invalid referrerId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!newUserId || typeof newUserId !== "string" || !UUID_REGEX.test(newUserId)) {
    return NextResponse.json(
      { error: "invalid newUserId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  // 自己紹介チェック
  if (referrerId === newUserId) {
    return NextResponse.json(
      { success: false, message: "self-referral not allowed" },
      { status: 200, headers: corsHeaders }
    );
  }

  try {
    const db = await getDb();

    // referrer の存在確認
    const referrerResult = await db.execute({
      sql: "SELECT id FROM users WHERE id = ?",
      args: [referrerId],
    });
    if (referrerResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "referrer not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // referrals テーブルへの INSERT（UNIQUE(referred_id) 制約で重複防止）
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      await db.execute({
        sql: "INSERT INTO referrals (id, referrer_id, referred_id, created_at) VALUES (?, ?, ?, ?)",
        args: [id, referrerId, newUserId, now],
      });
    } catch (e) {
      // UNIQUE 制約違反 = 既に紹介済み
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("UNIQUE constraint failed") || msg.includes("UNIQUE")) {
        return NextResponse.json(
          { success: false, message: "already referred" },
          { status: 200, headers: corsHeaders }
        );
      }
      throw e;
    }

    // referral_bonus += 10
    await db.execute({
      sql: "UPDATE users SET referral_bonus = referral_bonus + 10 WHERE id = ?",
      args: [referrerId],
    });

    // 紹介者と被紹介者を自動フレンド登録（accepted）
    const existingFriendship = await db.execute({
      sql: "SELECT id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)",
      args: [referrerId, newUserId, newUserId, referrerId],
    });

    if (existingFriendship.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO friendships (requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, 'accepted', ?, ?)",
        args: [referrerId, newUserId, now, now],
      });
    } else if (existingFriendship.rows[0].status !== "accepted") {
      await db.execute({
        sql: "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?",
        args: [now, existingFriendship.rows[0].id],
      });
    }

    return NextResponse.json(
      { success: true, message: "referral bonus awarded" },
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("[POST /api/referral/redeem]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
