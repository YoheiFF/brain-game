"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getOrCreateUser, updateUser } from "@/lib/db-user";
import {
  saveScoreToDb,
  recordDailyPlay,
  updateDailyHistory,
} from "@/lib/db-scores";
import { GAME_IDS, GAME_META, type GameId } from "@/lib/scores";

// ── バリデーション定数 ───────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ニックネームに使用可能な文字種
 * 許可: Unicode 文字・数字・区切り文字（日本語/英語対応）+ 一部記号
 * 禁止: 制御文字・絵文字 ZWJ 連結（爆弾対策）
 */
const NICKNAME_REGEX = /^[\p{L}\p{N}\p{Z}_\-\.・\s]{1,12}$/u;

/**
 * gameId ごとのスコア有効範囲
 * lowerIsBetter=true のゲーム (reaction) は [min, max] = [50, 2000]
 * lowerIsBetter=false のゲームは [0, max]
 */
const SCORE_LIMITS: Record<GameId, { min: number; max: number }> = {
  calculation:     { min: 0,  max: 60   },
  "memory-number": { min: 0,  max: 20   },
  stroop:          { min: 0,  max: 60   },
  reaction:        { min: 50, max: 2000 },
  pattern:         { min: 0,  max: 25   },
};

/** 1日あたりの同一ゲーム最大プレイ回数 */
const MAX_PLAYS_PER_DAY = 3;

export interface UpsertUserInput {
  id: string;       // UUID（クライアントが生成）
  nickname: string;
  age: number | null;
}

export interface RecordScoreInput {
  userId: string;
  gameId: GameId;
  score: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export async function upsertUser(input: UpsertUserInput): Promise<ActionResult> {
  // [追加] UUID 形式チェック
  if (!UUID_REGEX.test(input.id)) {
    return { success: false, error: "invalid userId format" };
  }

  const trimmedNickname = input.nickname.trim();

  if (trimmedNickname.length === 0) {
    return { success: false, error: "nickname is empty" };
  }
  if (trimmedNickname.length > 12) {
    return { success: false, error: "nickname too long" };
  }
  // [追加] 文字種チェック（長さチェック通過後に実行）
  if (!NICKNAME_REGEX.test(trimmedNickname)) {
    return { success: false, error: "invalid nickname characters" };
  }

  if (input.age !== null && (input.age < 1 || input.age > 120)) {
    return { success: false, error: "invalid age" };
  }

  try {
    await getOrCreateUser({
      id: input.id,
      nickname: trimmedNickname,
      age: input.age,
    });
    // 既存ユーザーのニックネーム・年齢を常に最新に更新する
    await updateUser(input.id, {
      nickname: trimmedNickname,
      age: input.age,
    });
    return { success: true };
  } catch (e) {
    console.error("[upsertUser]", e);
    return { success: false, error: "db error" };
  }
}

export async function recordScore(input: RecordScoreInput): Promise<ActionResult> {
  if (!input.userId) {
    return { success: false, error: "userId is required" };
  }

  // [変更] gameId チェックをスコアチェックより前に移動（SCORE_LIMITS 参照のため）
  if (!GAME_IDS.includes(input.gameId)) {
    return { success: false, error: "invalid gameId" };
  }

  // [変更/追加] スコア範囲チェック（既存の score < 0 チェックを拡張）
  const limits = SCORE_LIMITS[input.gameId];
  if (input.score < limits.min || input.score > limits.max) {
    return { success: false, error: "score out of range" };
  }

  try {
    // [追加] レート制限チェック（DB 参照）
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const playResult = await db.execute({
      sql: "SELECT play_count FROM daily_plays WHERE user_id = ? AND game_id = ? AND play_date = ?",
      args: [input.userId, input.gameId, today],
    });
    const currentPlayCount = playResult.rows[0]
      ? (playResult.rows[0].play_count as number)
      : 0;
    if (currentPlayCount >= MAX_PLAYS_PER_DAY) {
      return { success: false, error: "daily play limit exceeded" };
    }

    await saveScoreToDb(input.userId, input.gameId, input.score);
    await recordDailyPlay(input.userId, input.gameId, input.score);
    await updateDailyHistory(input.userId);
    revalidatePath("/rankings");
    return { success: true };
  } catch (e) {
    console.error("[recordScore]", e);
    return { success: false, error: "db error" };
  }
}
