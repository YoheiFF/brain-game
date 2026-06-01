"use client";
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, PASS_THRESHOLD, type Difficulty } from "@/lib/difficulty";
import { GAME_META, type GameId } from "@/lib/scores";

interface Props {
  challengeIndex: number;
  difficulty: Difficulty;
  gameId: GameId;
}

export default function SuperBrainBanner({ challengeIndex, difficulty, gameId }: Props) {
  const threshold = PASS_THRESHOLD[gameId]?.[difficulty];
  const meta = GAME_META[gameId];
  const lowerIsBetter = !!meta.lowerIsBetter;

  return (
    <div className="w-full mb-2 rounded-xl bg-[#1a1a2e] border border-orange-500/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-orange-400 font-black text-sm">🧠 SuperBrain</span>
          <span className="text-[#64748b] text-xs">第{challengeIndex + 1}問/5</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[difficulty]}`}>
          {DIFFICULTY_LABELS[difficulty]}
        </span>
      </div>
      {threshold !== undefined && (
        <div className="px-3 pb-2 text-xs text-[#64748b]">
          クリア基準：<span className="text-orange-300 font-bold">{threshold}{meta.unit}{lowerIsBetter ? "以下" : "以上"}</span>
        </div>
      )}
    </div>
  );
}
