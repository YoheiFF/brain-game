"use client";

interface Props {
  score: number;
  best: number | null;
  unit?: string;
  isNewBest: boolean;
  onRetry: () => void;
  onHome: () => void;
  lowerIsBetter?: boolean;
}

export default function ResultModal({ score, best, unit = "点", isNewBest, onRetry, onHome, lowerIsBetter }: Props) {
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
        {best !== null && (
          <div className="text-center">
            <p className="text-[#64748b] text-xs mb-1">ベスト</p>
            <p className="text-2xl font-bold text-[#6c63ff]">
              {best}
              <span className="text-sm ml-1">{unit}</span>
            </p>
          </div>
        )}
        <div className="flex gap-3 w-full">
          <button onClick={onHome} className="btn-secondary flex-1">ホーム</button>
          <button onClick={onRetry} className="btn-primary flex-1">もう一度</button>
        </div>
      </div>
    </div>
  );
}
