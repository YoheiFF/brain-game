import { NextRequest, NextResponse } from "next/server";
import { sendFriendRequest, FriendError } from "@/lib/db-friends";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { userId, friendCode } = body as { userId?: unknown; friendCode?: unknown };

  if (!userId || typeof userId !== "string" || !UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "invalid userId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!friendCode || typeof friendCode !== "string" || friendCode.trim() === "") {
    return NextResponse.json(
      { error: "invalid friendCode" },
      { status: 400, headers: corsHeaders }
    );
  }

  const normalizedCode = friendCode.toUpperCase().trim();

  try {
    const { addresseeNickname } = await sendFriendRequest(userId, normalizedCode);
    return NextResponse.json(
      { success: true, addresseeNickname },
      { headers: corsHeaders }
    );
  } catch (e) {
    if (e instanceof FriendError) {
      const messages: Record<FriendError['code'], string> = {
        NOT_FOUND: "フレンドコードが見つかりません",
        SELF_REQUEST: "自分自身には申請できません",
        ALREADY_EXISTS: "既に申請済みまたはフレンドです",
        LIMIT_EXCEEDED: "フレンド上限（50人）に達しています",
      };
      return NextResponse.json(
        { error: messages[e.code] },
        { status: e.httpStatus, headers: corsHeaders }
      );
    }
    console.error("[POST /api/friends/request]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
