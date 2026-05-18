import { NextRequest, NextResponse } from "next/server";
import { respondToFriendRequest, FriendError } from "@/lib/db-friends";

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

  const { userId, requesterId, action } = body as {
    userId?: unknown;
    requesterId?: unknown;
    action?: unknown;
  };

  if (!userId || typeof userId !== "string" || !UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "invalid userId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!requesterId || typeof requesterId !== "string" || !UUID_REGEX.test(requesterId)) {
    return NextResponse.json(
      { error: "invalid requesterId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  if (action !== "accept" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'accept' or 'reject'" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    await respondToFriendRequest(userId, requesterId, action);
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (e) {
    if (e instanceof FriendError) {
      return NextResponse.json(
        { error: "申請が見つかりません" },
        { status: 404, headers: corsHeaders }
      );
    }
    console.error("[POST /api/friends/respond]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
