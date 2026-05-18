"use client";
import { useState, useEffect, useCallback } from "react";
import { getUserId } from "@/lib/nickname";
import type { SyncResponse } from "@/lib/db-types";
import type { GameId } from "@/lib/scores";

interface UseDbSyncOptions {
  interval: number | null; // ポーリング間隔 (ms)。null = 初回フェッチのみ
}

interface UseDbSyncResult {
  data: SyncResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// lib/daily.ts の today() と同一実装（循環インポート回避）
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const KEY_DAILY = "braingame_daily";

interface DailyRecord {
  date: string;
  plays: Partial<Record<GameId, number>>;
  bestScores: Partial<Record<GameId, number>>;
}

/**
 * /api/sync の dailyPlays を braingame_daily localStorage に書き戻す。
 * - 今日のデータのみを対象とする（日付変わりで自動リセット）
 * - DB のプレイ数をそのままローカルに反映（DB を正として常に上書き）
 * - bestScores は DB 値を優先して上書き（DB に記録された正確な値を反映）
 */
function mergeDailyPlaysToStorage(
  dailyPlays: SyncResponse["dailyPlays"]
): void {
  const today = todayString();

  let record: DailyRecord;
  try {
    const raw = localStorage.getItem(KEY_DAILY);
    const parsed: DailyRecord | null = raw ? JSON.parse(raw) : null;
    // 今日のレコードでなければ空で初期化
    record =
      parsed && parsed.date === today
        ? parsed
        : { date: today, plays: {}, bestScores: {} };
  } catch {
    record = { date: today, plays: {}, bestScores: {} };
  }

  let changed = false;

  for (const [gameId, dbEntry] of Object.entries(dailyPlays) as [
    GameId,
    { playCount: number; bestScore: number | null }
  ][]) {
    if (!dbEntry) continue;

    const localPlayCount = record.plays[gameId] ?? 0;

    // DB を正として常に上書き（管理者リセット・複数端末同期を正しく反映するため）
    if (dbEntry.playCount !== localPlayCount) {
      record.plays[gameId] = dbEntry.playCount;
      changed = true;
    }

    // bestScore は DB 値を優先（DB に記録された確定値を反映）
    if (dbEntry.bestScore !== null) {
      const localBest = record.bestScores[gameId];
      if (localBest === undefined || dbEntry.bestScore !== localBest) {
        record.bestScores[gameId] = dbEntry.bestScore;
        changed = true;
      }
    }
  }

  if (changed) {
    localStorage.setItem(KEY_DAILY, JSON.stringify(record));
  }
}

export function useDbSync(
  options: UseDbSyncOptions = { interval: 30000 }
): UseDbSyncResult {
  const { interval } = options;
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    // localStorage から userId を取得
    const userId = getUserId();
    if (!userId) return; // 未設定（ニックネーム設定前）は何もしない

    setLoading(true);
    try {
      const res = await window.fetch(
        `/api/sync?userId=${encodeURIComponent(userId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SyncResponse = await res.json();
      setData(json);
      setError(null);

      // localStorage キャッシュを更新（オフラインフォールバック用）
      localStorage.setItem(
        "braingame_scores",
        JSON.stringify(json.personalBests)
      );
      localStorage.setItem(
        "braingame_rankings",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(json.gameRankings).map(([k, v]) => [
              k,
              v?.map((e) => ({
                nickname: e.nickname,
                score: e.score,
                date: e.date,
              })),
            ])
          )
        )
      );

      // braingame_daily の plays・bestScores を DB 値で更新（BUG-1・2 修正）
      if (json.dailyPlays) {
        mergeDailyPlaysToStorage(json.dailyPlays);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error("unknown error"));
      // エラー時は前回の data をそのまま保持
    } finally {
      setLoading(false);
    }
  }, []);

  // マウント直後に即時フェッチ
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ポーリング（interval が null でない場合）
  useEffect(() => {
    if (!interval) return;

    const handleVisibilityChange = () => {
      // 次のインターバルが来るまで待つだけ
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    }, interval);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [interval, fetchData]);

  return { data, loading, error, refetch: fetchData };
}
