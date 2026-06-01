"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { DIFFICULTY_PARAMS, PASS_THRESHOLD, isPassed, type Difficulty } from "@/lib/difficulty";
import { loadSession, saveSession, type ChallengeResult } from "@/lib/superbrain-session";
import SuperBrainBanner from "@/components/SuperBrainBanner";

type Phase = "ready" | "playing" | "result";

type Question = { a: number; b: number; op: "+" | "-" | "×" | "÷"; answer: number };

function generateQuestion(offset: number = 0): Question {
  const ops: ("+" | "-" | "×" | "÷")[] = ["+", "-", "×", "÷"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  switch (op) {
    case "+":
      a = Math.floor(Math.random() * (50 + offset)) + 1;
      b = Math.floor(Math.random() * (50 + offset)) + 1;
      answer = a + b;
      break;
    case "-":
      a = Math.floor(Math.random() * (50 + offset)) + 10;
      b = Math.floor(Math.random() * a) + 1;
      answer = a - b;
      break;
    case "×":
      a = Math.floor(Math.random() * 12) + 1;
      b = Math.floor(Math.random() * 12) + 1;
      answer = a * b;
      break;
    case "÷":
    default:
      b = Math.floor(Math.random() * 9) + 2;
      answer = Math.floor(Math.random() * 12) + 1;
      a = b * answer;
      break;
  }
  return { a, b, op, answer };
}

const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9"] as const;

function CalculationGameInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSuperBrain = searchParams.get("mode") === "superbrain";
  const sbDifficulty: Difficulty = (searchParams.get("difficulty") ?? "normal") as Difficulty;
  const sbSessionId = searchParams.get("sessionId") ?? "";
  const sbChallengeIndex = (() => {
    const session = isSuperBrain ? loadSession() : null;
    if (!session) return 0;
    return session.challengeIndex;
  })();

  const diffParams = isSuperBrain
    ? DIFFICULTY_PARAMS.calculation[sbDifficulty]
    : DIFFICULTY_PARAMS.calculation.normal;
  const gameTime = diffParams.gameTime;
  const numberOffset = diffParams.numberOffset;

  const { pause, resume } = useBGM();
  const [phase, setPhase] = useState<Phase>("ready");
  const [question, setQuestion] = useState<Question>(() => generateQuestion(numberOffset));
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(gameTime);
  const [flash, setFlash] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFreePointPlayRef = useRef(false);
  const scoreRef = useRef(0);

  const handleSuperBrainComplete = useCallback((score: number) => {
    const passed = isPassed("calculation", sbDifficulty, score);
    const threshold = PASS_THRESHOLD["calculation"]?.[sbDifficulty] ?? 0;
    try {
      const session = loadSession();
      if (session && session.sessionId === sbSessionId) {
        const result: ChallengeResult = {
          gameId: "calculation",
          difficulty: sbDifficulty,
          score,
          passed,
          clearThreshold: threshold,
        };
        session.results.push(result);
        saveSession(session);
      }
    } catch (e) {
      console.warn("[SuperBrain] sessionStorage error:", e);
      router.push(`/superbrain?session=${sbSessionId}&result=ng`);
      return;
    }
    router.push(`/superbrain?session=${sbSessionId}&result=${passed ? "ok" : "ng"}`);
  }, [sbDifficulty, sbSessionId, router]);

  const endGame = useCallback((currentScore: number) => {
    if (timerRef.current) clearInterval(timerRef.current);

    // SuperBrainモードの場合: スコア保存なし・プレイ回数カウントなし・ResultModal非表示
    if (isSuperBrain) {
      handleSuperBrainComplete(currentScore);
      return;
    }

    setFinalScore(currentScore);
    const isFreePointsUsed = isFreePointPlayRef.current;
    isFreePointPlayRef.current = false;
    const newBest = saveScore("calculation", currentScore, getNickname() ?? "ゲスト", getOrInitUserId(), isFreePointsUsed);
    recordPlay("calculation", currentScore);
    setRemaining(getRemainingPlays("calculation"));
    setFreePoints(getFreePoints());
    setBest(newBest);
    setIsNewBest(newBest === currentScore && currentScore > 0);
    setPhase("result");
  }, [isSuperBrain, handleSuperBrainComplete]);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setTimeLeft(gameTime);
    setInput("");
    setQuestion(generateQuestion(numberOffset));
    setPhase("playing");
  }, [gameTime, numberOffset]);

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  // SuperBrainモード時は自動でカウントダウン開始
  useEffect(() => {
    if (isSuperBrain && phase === "ready") {
      startCountdown();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperBrain]);

  useEffect(() => {
    setBest(getPersonalBest("calculation"));
    setRemaining(getRemainingPlays("calculation"));
    setFreePoints(getFreePoints());
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => { return () => { resume(); }; }, [resume]);

  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          endGame(scoreRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, endGame]);

  const handleNumpad = useCallback((key: string) => {
    if (phase !== "playing") return;

    setInput((prev) => {
      let next: string;
      if (key === "⌫") {
        next = prev.slice(0, -1);
      } else {
        if (prev.length >= 3) return prev;
        next = prev + key;
      }

      const val = parseInt(next, 10);
      if (!isNaN(val) && val === question.answer) {
        scoreRef.current += 1;
        setScore(scoreRef.current);
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
        setQuestion(generateQuestion(numberOffset));
        return "";
      }
      return next;
    });
  }, [phase, question.answer, numberOffset]);

  const timerColor =
    timeLeft > 20 ? "text-green-400" : timeLeft > 10 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        {isSuperBrain && (
          <SuperBrainBanner
            challengeIndex={sbChallengeIndex}
            difficulty={sbDifficulty}
            gameId="calculation"
          />
        )}
        <GameHeader title="計算ゲーム" description="制限時間内にできるだけ多くの計算問題を解こう" />

        {phase === "ready" && countdown === null && !isSuperBrain && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🧮</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>制限時間: <span className="text-white font-bold">30秒</span></p>
              <p>四則演算（+, -, ×, ÷）が出題されます</p>
              {best !== null && <p className="text-[#6c63ff]">自己ベスト: <span className="font-bold">{best}問</span></p>}
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
          <div className="card p-4 flex flex-col items-center gap-4 animate-scale-in">
            {/* スコア・タイマー */}
            <div className="flex justify-between w-full">
              <div className="text-center">
                <p className="text-[#64748b] text-xs">スコア</p>
                <p className="text-2xl font-black text-white">{score}</p>
              </div>
              <div className="text-center">
                <p className="text-[#64748b] text-xs">残り時間</p>
                <p className={`text-2xl font-black ${timerColor}`}>{timeLeft}s</p>
              </div>
            </div>

            {/* 問題 */}
            <div className={`text-4xl font-black text-white py-2 transition-all ${flash ? "text-green-400 scale-110" : ""}`}>
              {question.a} {question.op} {question.b} = ?
            </div>

            {/* 入力表示 */}
            <div className="w-full bg-[#0f0f1a] border-2 border-[#2a2a4a] rounded-xl p-3 text-center min-h-[56px] flex items-center justify-center">
              <span className={`text-3xl font-bold ${input ? "text-white" : "text-[#2a2a4a]"}`}>
                {input || "―"}
              </span>
            </div>

            {/* テンキー */}
            <div className="grid grid-cols-3 gap-2 w-full">
              {NUMPAD_KEYS.map((key) => (
                <button
                  key={key}
                  onPointerDown={(e) => { e.preventDefault(); handleNumpad(key); }}
                  className="h-14 rounded-xl text-xl font-bold text-white bg-[#1a1a2e] border border-[#2a2a4a] active:bg-[#2a2a4a] active:scale-95 transition-all select-none"
                >
                  {key}
                </button>
              ))}
              {/* 最終行: 0 (2列) + ⌫ (1列) */}
              <button
                onPointerDown={(e) => { e.preventDefault(); handleNumpad("0"); }}
                className="col-span-2 h-14 rounded-xl text-xl font-bold text-white bg-[#1a1a2e] border border-[#2a2a4a] active:bg-[#2a2a4a] active:scale-95 transition-all select-none"
              >
                0
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); handleNumpad("⌫"); }}
                className="h-14 rounded-xl text-xl font-bold text-[#64748b] bg-[#1a1a2e] border border-[#2a2a4a] active:bg-[#2a2a4a] active:scale-95 transition-all select-none"
              >
                ⌫
              </button>
            </div>
          </div>
        )}

        {phase === "result" && !isSuperBrain && (
          <ResultModal
            score={finalScore}
            best={best}
            unit="問"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            benchmark={(() => { const age = getAge(); if (!age) return undefined; const b = getBenchmark("calculation", age); return { ...b, unit: "問" }; })()}
            gameId="calculation"
          />
        )}
      </div>
    </div>
  );
}

export default function CalculationGame() {
  return (
    <Suspense fallback={
      <div className="game-container">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center text-[#64748b]">読み込み中...</div>
        </div>
      </div>
    }>
      <CalculationGameInner />
    </Suspense>
  );
}
