import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

  const { userId } = body as { userId?: unknown };

  if (!userId || typeof userId !== "string" || !UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "invalid userId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const db = await getDb();

    // 現在の referral_bonus を取得
    const result = await db.execute({
      sql: "SELECT referral_bonus FROM users WHERE id = ?",
      args: [userId],
    });

    if (result.rows.length === 0) {
      // ユーザーが存在しない場合も bonus=0 で正常レスポンス
      return NextResponse.json({ bonus: 0 }, { status: 200, headers: corsHeaders });
    }

    const bonus = (result.rows[0].referral_bonus as number) ?? 0;

    if (bonus > 0) {
      // 0 にリセット
      await db.execute({
        sql: "UPDATE users SET referral_bonus = 0 WHERE id = ?",
        args: [userId],
      });
    }

    return NextResponse.json({ bonus }, { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[POST /api/referral/consume]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
