"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameHeader from "@/components/GameHeader";
import ResultModal from "@/components/ResultModal";
import { saveScore, getPersonalBest } from "@/lib/scores";
import { getNickname, getAge } from "@/lib/nickname";
import { getBenchmark } from "@/lib/benchmarks";
import { recordPlay, getRemainingPlays, MAX_PLAYS_PER_DAY } from "@/lib/daily";

type Phase = "ready" | "waiting" | "go" | "tooEarly" | "result";

const ROUNDS = 5;
const MIN_WAIT = 1500;
const MAX_WAIT = 4000;

export default function ReactionGame() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [avgTime, setAvgTime] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBest(getPersonalBest("reaction"));
    setRemaining(getRemainingPlays("reaction"));
  }, []);

  const startRound = useCallback(() => {
    setPhase("waiting");
    const delay = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
    timeoutRef.current = setTimeout(() => {
      setStartTime(Date.now());
      setPhase("go");
    }, delay);
  }, []);

  const startGame = useCallback(() => {
    setRound(1);
    setTimes([]);
    startRound();
  }, [startRound]);

  const handleTap = useCallback(() => {
    if (phase === "waiting") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPhase("tooEarly");
      setTimeout(() => startRound(), 1500);
      return;
    }
    if (phase !== "go") return;

    const elapsed = Date.now() - startTime;
    const newTimes = [...times, elapsed];
    setTimes(newTimes);

    if (round >= ROUNDS) {
      const avg = Math.round(newTimes.reduce((a, b) => a + b, 0) / newTimes.length);
      setAvgTime(avg);
      const newBest = saveScore("reaction", avg, getNickname() ?? "ゲスト");
      recordPlay("reaction", avg);
      setRemaining(getRemainingPlays("reaction"));
      setBest(newBest);
      setIsNewBest(newBest === avg);
      setPhase("result");
    } else {
      setRound((r) => r + 1);
      setTimeout(() => startRound(), 800);
      setPhase("waiting");
    }
  }, [phase, startTime, times, round, startRound]);

  const bgColor =
    phase === "waiting" ? "bg-red-900/30 border-red-800" :
    phase === "go" ? "bg-green-700/40 border-green-500" :
    phase === "tooEarly" ? "bg-yellow-900/30 border-yellow-700" :
    "bg-[#1a1a2e] border-[#2a2a4a]";

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="反応速度テスト" description={`全${ROUNDS}回の平均反応時間を測定します`} />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">⚡</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>画面が<span className="text-green-400 font-bold">緑</span>になったらすぐにタップ！</p>
              <p>赤い間はタップしないでください</p>
              <p>{ROUNDS}回の平均タイムを計測します</p>
              {best !== null && <p className="text-[#6c63ff]">ベストスコア: <span className="font-bold">{best}ms</span> (低いほど良い)</p>}
            </div>
            {remaining > 0 ? (
              <button onClick={startGame} className="btn-primary w-full text-lg">
                スタート（残り{remaining}回）
              </button>
            ) : (
              <div className="text-center space-y-2">
                <p className="text-red-400 font-bold text-sm">
                  本日のプレイ上限（{MAX_PLAYS_PER_DAY}回）に達しました
                </p>
                <p className="text-[#64748b] text-xs">明日また挑戦しよう！</p>
              </div>
            )}
          </div>
        )}

        {(phase === "waiting" || phase === "go" || phase === "tooEarly") && (
          <div
            className={`card p-8 flex flex-col items-center gap-6 cursor-pointer select-none transition-all duration-150 border-2 ${bgColor}`}
            onClick={handleTap}
          >
            <div className="flex justify-between w-full">
              <span className="text-[#64748b] text-sm">ラウンド {round} / {ROUNDS}</span>
              <span className="text-[#64748b] text-sm">
                {times.length > 0 && `前回: ${times[times.length - 1]}ms`}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center h-48 gap-4">
              {phase === "waiting" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-red-600 animate-pulse-slow" />
                  <p className="text-red-400 font-bold text-lg">待ってください...</p>
                </>
              )}
              {phase === "go" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-green-500 animate-bounce-once" />
                  <p className="text-green-400 font-black text-2xl">今すぐタップ！</p>
                </>
              )}
              {phase === "tooEarly" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-yellow-500" />
                  <p className="text-yellow-400 font-bold text-lg">早すぎ！ やり直し...</p>
                </>
              )}
            </div>

            {times.length > 0 && (
              <div className="flex gap-2 flex-wrap justify-center">
                {times.map((t, i) => (
                  <span key={i} className="text-xs bg-[#2a2a4a] px-2 py-1 rounded text-[#64748b]">
                    {t}ms
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={avgTime}
            best={best}
            unit="ms"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            lowerIsBetter
            benchmark={(() => { const age = getAge(); if (!age) return undefined; const b = getBenchmark("reaction", age); return { ...b, unit: "ms", lowerIsBetter: true }; })()}
            gameId="reaction"
          />
        )}
      </div>
    </div>
  );
}
