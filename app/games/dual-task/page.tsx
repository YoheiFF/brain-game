"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameHeader from "@/components/GameHeader";
import ResultModal from "@/components/ResultModal";
import { saveScore, getPersonalBest } from "@/lib/scores";
import { getNickname, getAge, getOrInitUserId } from "@/lib/nickname";
import { getBenchmark } from "@/lib/benchmarks";
import { recordPlay, getRemainingPlays, MAX_PLAYS_PER_DAY, getRewardedRemaining } from "@/lib/daily";
import WatchAdButton from "@/components/WatchAdButton";
import { useBGM } from "@/components/BGMProvider";

type Phase = "ready" | "playing" | "result";
type LeftShape = "○" | "△" | "□" | "★";

const GAME_ID = "dual-task" as const;
const GAME_DURATION_SEC = 30;
const STIMULUS_INTERVAL_MS = 1200;
const RIGHT_OFFSET_MS = 600;
const LEFT_SHAPES: LeftShape[] = ["○", "△", "□", "★"];

export default function DualTaskGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION_SEC);
  const [leftShape, setLeftShape] = useState<LeftShape | null>(null);
  const [rightNumber, setRightNumber] = useState<number | null>(null);
  const [score, setScore] = useState<number>(0);
  const [leftCorrect, setLeftCorrect] = useState<number>(0);
  const [rightCorrect, setRightCorrect] = useState<number>(0);
  const [leftFeedback, setLeftFeedback] = useState<"ok" | "ng" | null>(null);
  const [rightFeedback, setRightFeedback] = useState<"ok" | "ng" | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [rewardedRemaining, setRewardedRemaining] = useState(0);

  const leftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rightOffsetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leftShapeRef = useRef<LeftShape | null>(null);
  const rightNumberRef = useRef<number | null>(null);
  const prevLeftShapeRef = useRef<LeftShape | null>(null);
  const prevRightNumberRef = useRef<number | null>(null);
  const leftTappedRef = useRef<boolean>(false);
  const rightTappedRef = useRef<boolean>(false);
  const leftCorrectRef = useRef<number>(0);
  const rightCorrectRef = useRef<number>(0);
  const timeLeftRef = useRef<number>(GAME_DURATION_SEC);
  const phaseRef = useRef<Phase>("ready");

  useEffect(() => {
    setBest(getPersonalBest(GAME_ID));
    setRemaining(getRemainingPlays(GAME_ID));
    setRewardedRemaining(getRewardedRemaining(GAME_ID));
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
    phaseRef.current = phase;
  }, [phase, pause, resume]);

  const clearAllTimers = useCallback(() => {
    if (leftTimerRef.current) clearInterval(leftTimerRef.current);
    if (rightTimerRef.current) clearInterval(rightTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (rightOffsetRef.current) clearTimeout(rightOffsetRef.current);
  }, []);

  useEffect(() => {
    return () => { resume(); clearAllTimers(); };
  }, [resume, clearAllTimers]);

  const endGame = useCallback(() => {
    clearAllTimers();
    setLeftShape(null);
    setRightNumber(null);
    const finalScore = leftCorrectRef.current + rightCorrectRef.current;
    const nickname = getNickname() ?? "ゲスト";
    const userId = getOrInitUserId();
    const newBest = saveScore(GAME_ID, finalScore, nickname, userId);
    recordPlay(GAME_ID, finalScore);
    setRemaining(getRemainingPlays(GAME_ID));
    setBest(newBest);
    setIsNewBest(newBest === finalScore && finalScore > 0);
    setScore(finalScore);
    setPhase("result");
  }, [clearAllTimers]);

  const startGame = useCallback(() => {
    clearAllTimers();

    // 全ステートリセット
    leftCorrectRef.current = 0;
    rightCorrectRef.current = 0;
    timeLeftRef.current = GAME_DURATION_SEC;
    leftTappedRef.current = false;
    rightTappedRef.current = false;
    leftShapeRef.current = null;
    rightNumberRef.current = null;
    prevLeftShapeRef.current = null;
    prevRightNumberRef.current = null;

    setScore(0);
    setLeftCorrect(0);
    setRightCorrect(0);
    setTimeLeft(GAME_DURATION_SEC);
    setLeftShape(null);
    setRightNumber(null);
    setLeftFeedback(null);
    setRightFeedback(null);
    setIsNewBest(false);
    setPhase("playing");

    // カウントダウンタイマー
    countdownRef.current = setInterval(() => {
      timeLeftRef.current--;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        endGame();
      }
    }, 1000);

    // 左パネルタイマー
    const startLeftTimer = () => {
      leftTimerRef.current = setInterval(() => {
        let newShape: LeftShape;
        do {
          newShape = LEFT_SHAPES[Math.floor(Math.random() * LEFT_SHAPES.length)];
        } while (newShape === prevLeftShapeRef.current);
        prevLeftShapeRef.current = newShape;
        leftShapeRef.current = newShape;
        setLeftShape(newShape);
        leftTappedRef.current = false;
      }, STIMULUS_INTERVAL_MS);
    };
    startLeftTimer();

    // 右パネルタイマー（オフセット付き）
    rightOffsetRef.current = setTimeout(() => {
      rightTimerRef.current = setInterval(() => {
        let newNumber: number;
        do {
          newNumber = Math.floor(Math.random() * 9) + 1;
        } while (newNumber === prevRightNumberRef.current);
        prevRightNumberRef.current = newNumber;
        rightNumberRef.current = newNumber;
        setRightNumber(newNumber);
        rightTappedRef.current = false;
      }, STIMULUS_INTERVAL_MS);
    }, RIGHT_OFFSET_MS);
  }, [clearAllTimers, endGame]);

  const handleLeftTap = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (leftTappedRef.current) return;
    leftTappedRef.current = true;

    if (leftShapeRef.current === "○") {
      leftCorrectRef.current++;
      setLeftCorrect(leftCorrectRef.current);
      setScore(leftCorrectRef.current + rightCorrectRef.current);
      setLeftFeedback("ok");
    } else {
      setLeftFeedback("ng");
    }

    setTimeout(() => setLeftFeedback(null), 300);
  }, []);

  const handleRightTap = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (rightTappedRef.current) return;
    rightTappedRef.current = true;

    if (rightNumberRef.current !== null && rightNumberRef.current % 2 === 0) {
      rightCorrectRef.current++;
      setRightCorrect(rightCorrectRef.current);
      setScore(leftCorrectRef.current + rightCorrectRef.current);
      setRightFeedback("ok");
    } else {
      setRightFeedback("ng");
    }

    setTimeout(() => setRightFeedback(null), 300);
  }, []);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="注意分割タスク" description="左は○を、右は偶数をタップしよう" />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">👁</div>
            <div className="text-center text-[#64748b] text-sm space-y-2">
              <p><span className="text-white font-bold">左パネル</span>: ○が出たらタップ（△□はスルー）</p>
              <p><span className="text-white font-bold">右パネル</span>: 偶数が出たらタップ（奇数はスルー）</p>
              <p>制限時間: <span className="text-white font-bold">30秒</span></p>
              {best !== null && <p className="text-[#6c63ff]">ベスト: <span className="font-bold">{best}問</span></p>}
            </div>
            {remaining > 0 ? (
              <button onClick={startGame} className="btn-primary w-full text-lg">
                スタート（残り{remaining}回）
              </button>
            ) : (
              <WatchAdButton gameId={GAME_ID} rewardedRemaining={rewardedRemaining} onRewarded={() => {
                setRemaining(getRemainingPlays(GAME_ID));
                setRewardedRemaining(getRewardedRemaining(GAME_ID));
              }} />
            )}
          </div>
        )}

        {phase === "playing" && (
          <div className="card p-6 flex flex-col items-center gap-4 animate-scale-in">
            <div className="flex justify-between w-full text-sm">
              <span className="text-[#64748b]">スコア: <span className="text-white font-bold">{score}</span></span>
              <span className={`font-bold ${timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-white"}`}>
                {timeLeft}秒
              </span>
            </div>

            <div className="flex gap-3 w-full">
              {/* 左パネル */}
              <button
                onClick={handleLeftTap}
                className={`flex-1 h-40 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-100
                  ${leftFeedback === "ok" ? "bg-green-500/20 border-green-500" :
                    leftFeedback === "ng" ? "bg-red-500/20 border-red-500" :
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
