"use client";
import { useState } from "react";
import type { GameId } from "@/lib/scores";
import { showRewardedAd } from "@/lib/admob";
import { recordRewardedPlay, MAX_REWARDED_PLAYS_PER_DAY } from "@/lib/daily";

interface Props {
  gameId: GameId;
  rewardedRemaining: number;
  onRewarded: () => void;
}

export default function WatchAdButton({ gameId, rewardedRemaining, onRewarded }: Props) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    setFailed(false);
    const rewarded = await showRewardedAd();
    if (rewarded) {
      recordRewardedPlay(gameId);
      onRewarded();
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  return (
    <div className="text-center space-y-3">
      <p className="text-red-400 font-bold text-sm">
        本日のプレイ上限（{MAX_REWARDED_PLAYS_PER_DAY * 2}回）に達しました
      </p>

      {rewardedRemaining > 0 ? (
        <>
          <button
            onClick={handleClick}
            disabled={loading}
            className="btn-secondary w-full text-sm font-bold disabled:opacity-50"
          >
            {loading ? "広告読み込み中..." : `📺 広告を見て+1プレイ（あと${rewardedRemaining}回）`}
          </button>
          {failed && (
            <p className="text-[#64748b] text-xs">広告を読み込めませんでした。もう一度お試しください。</p>
          )}
        </>
      ) : (
        <p className="text-[#64748b] text-xs">明日また挑戦しよう！</p>
      )}
    </div>
  );
}
