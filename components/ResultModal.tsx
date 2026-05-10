"use client";
import { calcGamePoints } from "@/lib/game-points";
import type { GameId } from "@/lib/scores";

interface BenchmarkInfo {
  ageGroup: string;
  average: number;
  unit: string;
  lowerIsBetter?: boolean;
}

interface Props {
  score: number;
  best: number | null;
  unit?: string;
  isNewBest: boolean;
  onRetry: () => void;
  onHome: () => void;
  lowerIsBetter?: boolean;
  benchmark?: BenchmarkInfo;
  gameId?: GameId;
}

export default function ResultModal({ score, best, unit = "点", isNewBest, onRetry, onHome, lowerIsBetter, benchmark, gameId }: Props) {
  const points = gameId !== undefined ? calcGamePoints(gameId, score) : undefined;
  const getBenchmarkLabel = (b: BenchmarkInfo) => {
    const better = b.lowerIsBetter ? score < b.average : score > b.average;
    const equal = score === b.average;
    if (equal) return { text: "平均と同じ", color: "text-yellow-400" };
    if (better) return { text: `平均より${!b.lowerIsBetter ? "+" : ""}${Math.abs(score - b.average)}${b.unit}上`, color: "text-green-400" };
    return { text: `平均より${Math.abs(score - b.average)}${b.unit}下`, color: "text-orange-400" };
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
      <div className="card p-8 flex flex-col items-center gap-5 max-w-sm w-full mx-4 animate-scale-in">
        {isNewBest && (
          <div className="text-yellow-400 font-black text-lg animate-bounce-once">
            🎉 新記録！
          </div>
        )}
        <div className="text-center">
          <p className="text-[#64748b] text-sm mb-1">スコア</p>
          <p className="text-5xl font-black text-white">
            {score}
            <span className="text-xl text-[#64748b] ml-1">{unit}</span>
          </p>
        </div>
        {points !== undefined && (
          <div className="flex items-center justify-center gap-2">
            <div className={`flex items-center gap-1.5 border rounded-xl px-5 py-2 ${
              points >= 15 ? "bg-green-500/10 border-green-500/30" :
              points >= 8  ? "bg-[#6c63ff]/10 border-[#6c63ff]/30" :
                             "bg-orange-500/10 border-orange-500/30"
            }`}>
              <span className={`text-3xl font-black ${
                points >= 15 ? "text-green-400" :
                points >= 8  ? "text-[#6c63ff]" : "text-orange-400"
              }`}>{points}</span>
              <span className="text-[#64748b] text-sm">/ 20点</span>
            </div>
          </div>
        )}
        {best !== null && (
          <div className="text-center">
            <p className="text-[#64748b] text-xs mb-1">ベスト</p>
            <p className="text-2xl font-bold text-[#6c63ff]">
              {best}
              <span className="text-sm ml-1">{unit}</span>
            </p>
          </div>
        )}
        {benchmark && (() => {
          const label = getBenchmarkLabel(benchmark);
          return (
            <div className="w-full bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-4">
              <p className="text-[#64748b] text-xs text-center mb-2">{benchmark.ageGroup}の平均</p>
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">
                  {benchmark.average}
                  <span className="text-[#64748b] text-sm ml-1">{benchmark.unit}</span>
                </span>
                <span className={`text-sm font-bold ${label.color}`}>{label.text}</span>
              </div>
            </div>
          );
        })()}
        <div className="flex gap-3 w-full">
          <button onClick={onHome} className="btn-secondary flex-1">ホーム</button>
          <button onClick={onRetry} className="btn-primary flex-1">もう一度</button>
        </div>
      </div>
    </div>
  );
}
