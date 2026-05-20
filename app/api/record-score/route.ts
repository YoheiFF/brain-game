import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  saveScoreToDb,
  recordDailyPlay,
} from "@/lib/db-scores";
import { GAME_IDS, type GameId } from "@/lib/scores";

// ── バリデーション定数（app/actions/user.ts と同一） ───────────────
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCORE_LIMITS: Record<GameId, { min: number; max: number }> = {
  calculation:     { min: 0,  max: 60   },
  "memory-number": { min: 0,  max: 20   },
  stroop:          { min: 0,  max: 60   },
  reaction:        { min: 50, max: 2000 },
  pattern:         { min: 0,  max: 25   },
  "n-back":          { min: 0, max: 200  },
  "dual-task":       { min: 0, max: 99   },
  "trail-making":    { min: 0, max: 1000 },
  "mental-rotation": { min: 0, max: 20   },
};

const MAX_PLAYS_PER_DAY = 6; // 3 base + 3 rewarded

// ── CORS（/api/sync/route.ts と同一パターン） ────────────────────
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

// ── Preflight ────────────────────────────────────────────────────
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

// ── POST /api/record-score ───────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { userId, gameId, score } = body as {
    userId?: unknown;
    gameId?: unknown;
    score?: unknown;
  };

  // バリデーション: userId
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    return NextResponse.json(
      { success: false, error: "userId is required" },
      { status: 400, headers: corsHeaders }
    );
  }
  if (!UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { success: false, error: "invalid userId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  // バリデーション: gameId
  if (!gameId || typeof gameId !== "string" || !GAME_IDS.includes(gameId as GameId)) {
    return NextResponse.json(
      { success: false, error: "invalid gameId" },
      { status: 400, headers: corsHeaders }
    );
  }
  const validGameId = gameId as GameId;

  // バリデーション: score
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return NextResponse.json(
      { success: false, error: "score must be a number" },
      { status: 400, headers: corsHeaders }
    );
  }
  const limits = SCORE_LIMITS[validGameId];
  if (score < limits.min || score > limits.max) {
    return NextResponse.json(
      { success: false, error: "score out of range" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 1日上限チェック（DB 参照）
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const playResult = await db.execute({
      sql: "SELECT play_count FROM daily_plays WHERE user_id = ? AND game_id = ? AND play_date = ?",
      args: [userId, validGameId, today],
    });
    const currentPlayCount = playResult.rows[0]
      ? (playResult.rows[0].play_count as number)
      : 0;
    if (currentPlayCount >= MAX_PLAYS_PER_DAY) {
      return NextResponse.json(
        { success: false, error: "daily play limit exceeded" },
        { status: 429, headers: corsHeaders }
      );
    }

    // DB 書き込み
    await saveScoreToDb(userId, validGameId, score);
    await recordDailyPlay(userId, validGameId, score);

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error("[POST /api/record-score]", e);
    return NextResponse.json(
      { success: false, error: "db error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
