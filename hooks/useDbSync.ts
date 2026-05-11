"use client";
import { useState, useEffect, useCallback } from "react";
import { getUserId } from "@/lib/nickname";
import type { SyncResponse } from "@/lib/db-types";

interface UseDbSyncOptions {
  interval: number | null; // ポーリング間隔 (ms)。null = 初回フェッチのみ
}

interface UseDbSyncResult {
  data: SyncResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
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
