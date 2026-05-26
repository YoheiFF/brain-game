"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameHeader from "@/components/GameHeader";
import ResultModal from "@/components/ResultModal";
import { saveScore, getPersonalBest } from "@/lib/scores";
import { getNickname, getAge, getOrInitUserId } from "@/lib/nickname";
import { getBenchmark } from "@/lib/benchmarks";
import { recordPlay, getRemainingPlays, MAX_PLAYS_PER_DAY, getFreePoints, consumeFreePoint } from "@/lib/daily";
import WatchAdButton from "@/components/WatchAdButton";
import { useBGM } from "@/components/BGMProvider";

type Phase = "ready" | "showing" | "input" | "correct" | "wrong" | "result";

const GRID = 6;
const TOTAL = GRID * GRID;

function generatePattern(count: number): Set<number> {
  const cells = new Set<number>();
  while (cells.size < count) {
    cells.add(Math.floor(Math.random() * TOTAL));
  }
  return cells;
}

export default function PatternGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(3);
  const [pattern, setPattern] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCells, setWrongCells] = useState<Set<number>>(new Set());
  const isFreePointPlayRef = useRef(false);

  useEffect(() => {
    setBest(getPersonalBest("pattern"));
    setRemaining(getRemainingPlays("pattern"));
    setFreePoints(getFreePoints());
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => { return () => { resume(); }; }, [resume]);

  const startRound = useCallback((lvl: number) => {
    const p = generatePattern(Math.min(lvl + 2, TOTAL - 1));
    setPattern(p);
    setSelected(new Set());
    setWrongCells(new Set());
    setPhase("showing");
    setTimeout(() => setPhase("input"), 1200 + lvl * 100);
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setLevel(1);
    startRound(1);
  }, [startRound]);

  const toggleCell = useCallback((i: number) => {
    if (phase !== "input") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, [phase]);

  const handleSubmit = useCallback(() => {
    if (phase !== "input") return;
    const isCorrect =
      selected.size === pattern.size &&
      [...selected].every((c) => pattern.has(c));

    if (isCorrect) {
      const newScore = patternCount;
      setScore(newScore);
      setPhase("correct");
      setTimeout(() => {
        const next = level + 1;
        setLevel(next);
        startRound(next);
      }, 800);
    } else {
      const wrong = new Set([...selected].filter((c) => !pattern.has(c)));
      setWrongCells(wrong);
      setPhase("wrong");
      setTimeout(() => {
        const isFreePointsUsed = isFreePointPlayRef.current;
        isFreePointPlayRef.current = false;
        const newBest = saveScore("pattern", score, getNickname() ?? "ゲスト", getOrInitUserId(), isFreePointsUsed);
        recordPlay("pattern", score);
        setRemaining(getRemainingPlays("pattern"));
        setFreePoints(getFreePoints());
        setBest(newBest);
        setIsNewBest(newBest === score && score > 0);
        setPhase("result");
      }, 1500);
    }
  }, [phase, selected, pattern, score, level, startRound]);

  const patternCount = Math.min(level + 2, 25);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="図形記憶" description="光ったマスの位置を覚えて同じように選択しよう" />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🧩</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>光ったマスを覚えて同じように選択してください</p>
              <p>正解するごとに<span className="text-white font-bold">マス数が増えます</span></p>
              {best !== null && <p className="text-[#6c63ff]">ベストスコア: <span className="font-bold">{best}点</span></p>}
            </div>
            {remaining > 0 ? (
              <button onClick={startGame} className="btn-primary w-full text-lg">
                スタート（残り{remaining}回）
              </button>
            ) : freePoints > 0 ? (
              <button
                onClick={() => { consumeFreePoint(); isFreePointPlayRef.current = true; setFreePoints(getFreePoints()); startGame(); }}
                className="btn-primary w-full text-lg"
              >
                フリーポイントを使用してプレイ（残り{freePoints}pt）
              </button>
            ) : (
              <WatchAdButton onRewarded={() => { setFreePoints(getFreePoints()); }} />
            )}
          </div>
        )}

        {(phase === "showing" || phase === "input" || phase === "correct" || phase === "wrong") && (
          <div className="card p-6 flex flex-col items-center gap-5 animate-scale-in">
            <div className="flex justify-between w-full">
              <span className="text-[#64748b] text-sm">レベル {level}</span>
              <span className="text-[#64748b] text-sm">スコア: <span className="text-white font-bold">{score}</span></span>
            </div>

            <div className="h-5 flex items-center justify-center">
              {phase === "showing" && (
                <p className="text-[#64748b] text-sm animate-pulse">
                  覚えてください... ({patternCount}マス)
                </p>
              )}
              {phase === "input" && (
                <p className="text-[#64748b] text-sm">
                  {patternCount}マスを選択してください ({selected.size}/{patternCount})
                </p>
              )}
              {phase === "correct" && (
                <p className="text-green-400 text-sm font-bold animate-bounce-once">✅ 正解！</p>
              )}
              {phase === "wrong" && (
                <p className="text-red-400 text-sm font-bold">❌ 不正解...</p>
              )}
            </div>

            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
            >
              {Array.from({ length: TOTAL }, (_, i) => {
                const isPattern = pattern.has(i);
                const isSelected = selected.has(i);
                const isWrong = wrongCells.has(i);

                let cellClass = "w-10 h-10 rounded-lg transition-all duration-150 cursor-pointer border-2 ";
                if (phase === "showing") {
                  cellClass += isPattern
                    ? "bg-[#6c63ff] border-[#8b83ff] scale-105"
                    : "bg-[#1a1a2e] border-[#2a2a4a]";
                } else if (phase === "input") {
                  cellClass += isSelected
                    ? "bg-[#6c63ff] border-[#8b83ff] scale-105"
                    : "bg-[#1a1a2e] border-[#2a2a4a] hover:border-[#6c63ff]";
                } else if (phase === "correct") {
                  cellClass += isPattern
                    ? "bg-green-600 border-green-400"
                    : "bg-[#1a1a2e] border-[#2a2a4a]";
                } else if (phase === "wrong") {
                  if (isWrong) cellClass += "bg-red-600 border-red-400";
                  else if (isPattern && !isSelected) cellClass += "bg-[#6c63ff] border-[#8b83ff] opacity-60";
                  else if (isPattern && isSelected) cellClass += "bg-green-600 border-green-400";
                  else cellClass += "bg-[#1a1a2e] border-[#2a2a4a]";
                }

                return (
                  <button
                    key={i}
                    className={cellClass}
                    onClick={() => toggleCell(i)}
                    disabled={phase !== "input"}
                  />
                );
              })}
            </div>

            <button
              onClick={handleSubmit}
              disabled={phase !== "input" || selected.size !== patternCount}
              className={`btn-primary w-full disabled:opacity-40 ${phase !== "input" ? "invisible pointer-events-none" : ""}`}
            >
              決定 ({selected.size}/{patternCount})
            </button>
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={score}
            best={best}
            unit="個"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            benchmark={(() => { const age = getAge(); if (!age) return undefined; const b = getBenchmark("pattern", age); return { ...b, unit: "個" }; })()}
            gameId="pattern"
          />
        )}
      </div>
    </div>
  );
}
