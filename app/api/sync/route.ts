import { NextRequest, NextResponse } from "next/server";
import {
  getPersonalBestsFromDb,
  getRankingsFromDb,
  getUserRanksFromDb,
  getDailyPlaysFromDb,
  getDailyHistoryFromDb,
} from "@/lib/db-scores";
import type { SyncResponse } from "@/lib/db-types";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get("userId");
  const origin = request.headers.get("origin");

  if (!userId || userId.trim() === "") {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 }
    );
  }

  if (!UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "invalid userId format" },
      { status: 400 }
    );
  }

  try {
    const [personalBests, rankings, myRanks, dailyPlays, dailyHistory] =
      await Promise.all([
        getPersonalBestsFromDb(userId),
        getRankingsFromDb(),
        getUserRanksFromDb(userId),
        getDailyPlaysFromDb(userId),
        getDailyHistoryFromDb(userId, 14),
      ]);

    const body: SyncResponse = {
      personalBests,
      gameRankings: rankings.gameRankings,
      overallRanking: rankings.overallRanking,
      myGameRanks: myRanks.gameRanks,
      myOverallRank: myRanks.overallRank,
      dailyPlays,
      dailyHistory,
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "no-store",
        ...getCorsHeaders(origin),
      },
    });
  } catch (e) {
    console.error("[GET /api/sync]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
