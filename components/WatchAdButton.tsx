"use client";
import { useState } from "react";
import { showRewardedAd } from "@/lib/admob";
import { addFreePoint } from "@/lib/daily";

interface Props {
  onRewarded: () => void;
}

export default function WatchAdButton({ onRewarded }: Props) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    setFailed(false);
    const rewarded = await showRewardedAd();
    if (rewarded) {
      addFreePoint();
      onRewarded();
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  return (
    <div className="text-center space-y-3">
      <p className="text-red-400 font-bold text-sm">
        本日の無料プレイ（{3}回）を使い切りました
      </p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn-secondary w-full text-sm font-bold disabled:opacity-50"
      >
        {loading ? "広告読み込み中..." : "📺 広告を見てフリーポイント+1"}
      </button>
      {failed && (
        <p className="text-[#64748b] text-xs">広告を読み込めませんでした。もう一度お試しください。</p>
      )}
    </div>
  );
}
