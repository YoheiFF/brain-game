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
import { useCountdown } from "@/hooks/useCountdown";
import CountdownOverlay from "@/components/CountdownOverlay";

type Phase = "ready" | "playing" | "result";
type LeftShape = "○" | "△" | "□" | "★";

const GAME_ID = "dual-task" as const;
const TOTAL_ROUNDS = 20;
const LEFT_INTERVAL_MS = 1100;
const RIGHT_INTERVAL_MS = 1000;
const FAST_LEFT_INTERVAL_MS = 700;
const FAST_RIGHT_INTERVAL_MS = 800;
const BOOST_THRESHOLD = 15;
const LEFT_SHAPES: LeftShape[] = ["○", "△", "□", "★"];

export default function DualTaskGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [leftShape, setLeftShape] = useState<LeftShape | null>(null);
  const [rightNumber, setRightNumber] = useState<number | null>(null);
  const [score, setScore] = useState<number>(0);
  const [leftCorrect, setLeftCorrect] = useState<number>(0);
  const [rightCorrect, setRightCorrect] = useState<number>(0);
  const [missCount, setMissCount] = useState<number>(0);
  const [leftFeedback, setLeftFeedback] = useState<"ok" | "ng" | null>(null);
  const [rightFeedback, setRightFeedback] = useState<"ok" | "ng" | null>(null);
  const [speedBoosted, setSpeedBoosted] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);

  const leftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leftShapeRef = useRef<LeftShape | null>(null);
  const rightNumberRef = useRef<number | null>(null);
  const prevLeftShapeRef = useRef<LeftShape | null>(null);
  const prevRightNumberRef = useRef<number | null>(null);
  const leftTappedRef = useRef<boolean>(false);
  const rightTappedRef = useRef<boolean>(false);
  const leftCorrectRef = useRef<number>(0);
  const rightCorrectRef = useRef<number>(0);
  const totalMissRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("ready");
  const gameEndedRef = useRef<boolean>(false);
  const speedBoostedRef = useRef<boolean>(false);
  const isFreePointPlayRef = useRef(false);

  useEffect(() => {
    setBest(getPersonalBest(GAME_ID));
    setRemaining(getRemainingPlays(GAME_ID));
    setFreePoints(getFreePoints());
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
    phaseRef.current = phase;
  }, [phase, pause, resume]);

  const clearAllTimers = useCallback(() => {
    if (leftTimerRef.current) clearInterval(leftTimerRef.current);
    if (rightTimerRef.current) clearInterval(rightTimerRef.current);
  }, []);

  useEffect(() => {
    return () => { resume(); clearAllTimers(); };
  }, [resume, clearAllTimers]);

  const endGame = useCallback(() => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    clearAllTimers();
    setLeftShape(null);
    setRightNumber(null);
    const finalScore = leftCorrectRef.current + rightCorrectRef.current;
    const nickname = getNickname() ?? "ゲスト";
    const userId = getOrInitUserId();
    const isFreePointsUsed = isFreePointPlayRef.current;
    isFreePointPlayRef.current = false;
    const newBest = saveScore(GAME_ID, finalScore, nickname, userId, isFreePointsUsed);
    recordPlay(GAME_ID, finalScore);
    setRemaining(getRemainingPlays(GAME_ID));
    setFreePoints(getFreePoints());
    setBest(newBest);
    setIsNewBest(newBest === finalScore && finalScore > 0);
    setScore(finalScore);
    setPhase("result");
  }, [clearAllTimers]);

  // 左右を別インターバルで独立して切り替える
  const startTimers = useCallback((leftMs: number, rightMs: number) => {
    if (leftTimerRef.current) clearInterval(leftTimerRef.current);
    if (rightTimerRef.current) clearInterval(rightTimerRef.current);

    leftTimerRef.current = setInterval(() => {
      if (gameEndedRef.current) return;
      if (prevLeftShapeRef.current === "○" && !leftTappedRef.current) {
        totalMissRef.current++;
        setMissCount(totalMissRef.current);
        if (leftCorrectRef.current + rightCorrectRef.current + totalMissRef.current >= TOTAL_ROUNDS) {
          endGame(); return;
        }
      }
      let newShape: LeftShape;
      do {
        newShape = LEFT_SHAPES[Math.floor(Math.random() * LEFT_SHAPES.length)];
      } while (newShape === prevLeftShapeRef.current);
      prevLeftShapeRef.current = newShape;
      leftShapeRef.current = newShape;
      setLeftShape(newShape);
      leftTappedRef.current = false;
    }, leftMs);

    rightTimerRef.current = setInterval(() => {
      if (gameEndedRef.current) return;
      if (prevRightNumberRef.current !== null && prevRightNumberRef.current % 2 === 0 && !rightTappedRef.current) {
        totalMissRef.current++;
        setMissCount(totalMissRef.current);
        if (leftCorrectRef.current + rightCorrectRef.current + totalMissRef.current >= TOTAL_ROUNDS) {
          endGame(); return;
        }
      }
      let newNumber: number;
      do {
        newNumber = Math.floor(Math.random() * 9) + 1;
      } while (newNumber === prevRightNumberRef.current);
      prevRightNumberRef.current = newNumber;
      rightNumberRef.current = newNumber;
      setRightNumber(newNumber);
      rightTappedRef.current = false;
    }, rightMs);
  }, [endGame]);

  const boostSpeed = useCallback(() => {
    if (speedBoostedRef.current || gameEndedRef.current) return;
    speedBoostedRef.current = true;
    setSpeedBoosted(true);
    startTimers(FAST_LEFT_INTERVAL_MS, FAST_RIGHT_INTERVAL_MS);
  }, [startTimers]);

  const startGame = useCallback(() => {
    clearAllTimers();
    gameEndedRef.current = false;
    speedBoostedRef.current = false;

    leftCorrectRef.current = 0;
    rightCorrectRef.current = 0;
    totalMissRef.current = 0;
    leftTappedRef.current = false;
    rightTappedRef.current = false;
    leftShapeRef.current = null;
    rightNumberRef.current = null;
    prevLeftShapeRef.current = null;
    prevRightNumberRef.current = null;

    setScore(0);
    setLeftCorrect(0);
    setRightCorrect(0);
    setMissCount(0);
    setLeftShape(null);
    setRightNumber(null);
    setLeftFeedback(null);
    setRightFeedback(null);
    setSpeedBoosted(false);
    setIsNewBest(false);
    setPhase("playing");

    startTimers(LEFT_INTERVAL_MS, RIGHT_INTERVAL_MS);
  }, [clearAllTimers, startTimers]);

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  const handleLeftTap = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (leftShapeRef.current === null) return;
    if (leftTappedRef.current) return;
    leftTappedRef.current = true;

    if (leftShapeRef.current === "○") {
      leftCorrectRef.current++;
      setLeftCorrect(leftCorrectRef.current);
      setLeftFeedback("ok");
    } else {
      totalMissRef.current++;
      setMissCount(totalMissRef.current);
      setLeftFeedback("ng");
    }

    setTimeout(() => setLeftFeedback(null), 300);

    const totalCorrect = leftCorrectRef.current + rightCorrectRef.current;
    if (totalCorrect >= BOOST_THRESHOLD && totalMissRef.current === 0) boostSpeed();
    if (totalCorrect + totalMissRef.current >= TOTAL_ROUNDS) endGame();
  }, [endGame, boostSpeed]);

  const handleRightTap = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (rightNumberRef.current === null) return;
    if (rightTappedRef.current) return;
    rightTappedRef.current = true;

    if (rightNumberRef.current % 2 === 0) {
      rightCorrectRef.current++;
      setRightCorrect(rightCorrectRef.current);
      setRightFeedback("ok");
    } else {
      totalMissRef.current++;
      setMissCount(totalMissRef.current);
      setRightFeedback("ng");
    }

    setTimeout(() => setRightFeedback(null), 300);

    const totalCorrect = leftCorrectRef.current + rightCorrectRef.current;
    if (totalCorrect >= BOOST_THRESHOLD && totalMissRef.current === 0) boostSpeed();
    if (totalCorrect + totalMissRef.current >= TOTAL_ROUNDS) endGame();
  }, [endGame, boostSpeed]);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="注意分割タスク" description="左は○を、右は偶数をタップしよう" />

        {phase === "ready" && countdown === null && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">👁</div>
            <div className="text-center text-[#64748b] text-sm space-y-2">
              <p><span className="text-white font-bold">左パネル</span>: ○が出たらタップ（他はスルー）</p>
              <p><span className="text-white font-bold">右パネル</span>: 偶数が出たらタップ（奇数はスルー）</p>
              <p>正解 + ミス・見逃しの合計<span className="text-white font-bold">20回</span>で終了</p>
              <p>全問正解で<span className="text-white font-bold">満点（20問）</span></p>
              {best !== null && <p className="text-[#6c63ff]">ベスト: <span className="font-bold">{best}問</span></p>}
            </div>
            {remaining > 0 ? (
              <button onClick={startCountdown} className="btn-primary w-full text-lg">
                スタート（残り{remaining}回）
              </button>
            ) : freePoints > 0 ? (
              <button
                onClick={() => { consumeFreePoint(); isFreePointPlayRef.current = true; setFreePoints(getFreePoints()); startCountdown(); }}
                className="btn-primary w-full text-lg"
              >
                フリーポイントを使用してプレイ（残り{freePoints}pt）
              </button>
            ) : (
              <WatchAdButton onRewarded={() => { setFreePoints(getFreePoints()); }} />
            )}
          </div>
        )}

        <CountdownOverlay count={countdown} />

        {phase === "playing" && (
          <div className="card p-6 flex flex-col items-center gap-4 animate-scale-in">
            <div className="flex justify-between w-full text-sm items-center">
              <span className="text-[#64748b]">正解: <span className="text-white font-bold">{leftCorrect + rightCorrect}</span></span>
              {speedBoosted && <span className="text-yellow-400 text-xs font-bold animate-pulse">⚡ 高速モード</span>}
              <span className="text-[#64748b]">ミス: <span className="text-red-400 font-bold">{missCount}</span></span>
              <span className="text-[#64748b]">残り: <span className="text-white font-bold">{TOTAL_ROUNDS - leftCorrect - rightCorrect - missCount}</span></span>
            </div>

            <div className="flex gap-3 w-full">
              {/* 左パネル */}
              <button
                onClick={handleLeftTap}
                className={`flex-1 h-40 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-100
                  ${leftFeedback === "ok" ? "bg-green-500/20 border-green-500" :
                    leftFeedback === "ng" ? "bg-red-500/20 border-red-500" :
                    speedBoosted ? "bg-[#1a1a2e] border-yellow-500/50 active:scale-95" :
                    "bg-[#1a1a2e] border-[#2a2a4a] active:scale-95"}`}
              >
                <span className="text-4xl font-bold text-white">{leftShape ?? ""}</span>
                <span className="text-[#64748b] text-xs">左: ○のみ</span>
                <span className="text-[#6c63ff] text-xs font-bold">{leftCorrect}問</span>
              </button>

              {/* 右パネル */}
              <button
                onClick={handleRightTap}
                className={`flex-1 h-40 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-100
                  ${rightFeedback === "ok" ? "bg-green-500/20 border-green-500" :
                    rightFeedback === "ng" ? "bg-red-500/20 border-red-500" :
                    speedBoosted ? "bg-[#1a1a2e] border-yellow-500/50 active:scale-95" :
                    "bg-[#1a1a2e] border-[#2a2a4a] active:scale-95"}`}
              >
                <span className="text-4xl font-bold text-white">{rightNumber ?? ""}</span>
                <span className="text-[#64748b] text-xs">右: 偶数のみ</span>
                <span className="text-[#6c63ff] text-xs font-bold">{rightCorrect}問</span>
              </button>
            </div>
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={score}
            best={best}
            unit="問"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            benchmark={(() => {
              const age = getAge();
              if (!age) return undefined;
              const b = getBenchmark(GAME_ID, age);
              return { ...b, unit: "問" };
            })()}
            gameId={GAME_ID}
          />
        )}
      </div>
    </div>
  );
}
