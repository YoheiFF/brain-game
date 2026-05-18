import { NextRequest, NextResponse } from "next/server";
import { getFriendsByUserId } from "@/lib/db-friends";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId || !UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "invalid userId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const friends = await getFriendsByUserId(userId);
    return NextResponse.json(friends, { headers: corsHeaders });
  } catch (e) {
    console.error("[GET /api/friends]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
