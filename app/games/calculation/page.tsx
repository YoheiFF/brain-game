"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameHeader from "@/components/GameHeader";
import ResultModal from "@/components/ResultModal";
import { saveScore, getPersonalBest } from "@/lib/scores";
import { getNickname, getAge } from "@/lib/nickname";
import { getBenchmark } from "@/lib/benchmarks";
import { recordPlay, getRemainingPlays, MAX_PLAYS_PER_DAY } from "@/lib/daily";

type Phase = "ready" | "playing" | "result";

type Question = { a: number; b: number; op: "+" | "-" | "×" | "÷"; answer: number };

function generateQuestion(): Question {
  const ops: ("+" | "-" | "×" | "÷")[] = ["+", "-", "×", "÷"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  switch (op) {
    case "+":
      a = Math.floor(Math.random() * 50) + 1;
      b = Math.floor(Math.random() * 50) + 1;
      answer = a + b;
      break;
    case "-":
      a = Math.floor(Math.random() * 50) + 10;
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

const GAME_TIME = 30;

export default function CalculationGame() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [question, setQuestion] = useState<Question>(generateQuestion());
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const endGame = useCallback((currentScore: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setFinalScore(currentScore);
    const newBest = saveScore("calculation", currentScore, getNickname() ?? "ゲスト");
    recordPlay("calculation", currentScore);
    setRemaining(getRemainingPlays("calculation"));
    setBest(newBest);
    setIsNewBest(newBest === currentScore && currentScore > 0);
    setPhase("result");
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setTimeLeft(GAME_TIME);
    setInput("");
    setQuestion(generateQuestion());
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    setBest(getPersonalBest("calculation"));
    setRemaining(getRemainingPlays("calculation"));
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setScore((s) => { endGame(s); return s; });
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, endGame]);

  const handleSubmit = useCallback(() => {
    if (phase !== "playing") return;
    const val = parseInt(input, 10);
    if (isNaN(val)) return;
    if (val === question.answer) {
      setScore((s) => s + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 200);
      setQuestion(generateQuestion());
      setInput("");
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setInput("");
    }
  }, [input, phase, question.answer]);

  const timerColor =
    timeLeft > 20 ? "text-green-400" : timeLeft > 10 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="計算ゲーム" description="30秒間でできるだけ多くの計算問題を解こう" />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🧮</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>制限時間: <span className="text-white font-bold">30秒</span></p>
              <p>四則演算（+, -, ×, ÷）が出題されます</p>
              {best !== null && <p className="text-[#6c63ff]">自己ベスト: <span className="font-bold">{best}問</span></p>}
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

        {phase === "playing" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
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

            <div className={`text-5xl font-black text-white py-4 transition-all ${flash ? "text-green-400 scale-110" : ""}`}>
              {question.a} {question.op} {question.b} = ?
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="w-full">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                enterKeyHint="go"
                pattern="-?[0-9]*"
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/[^0-9-]/g, ""))}
                onBlur={() => { if (phase === "playing") setTimeout(() => inputRef.current?.focus(), 10); }}
                className={`w-full text-center text-3xl font-bold bg-[#0f0f1a] border-2 rounded-xl p-3 text-white outline-none focus:border-[#6c63ff] transition-all ${shake ? "border-red-500 animate-[shake_0.3s_ease]" : "border-[#2a2a4a]"}`}
                placeholder="答えを入力"
                autoComplete="off"
              />
            </form>
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={finalScore}
            best={best}
            unit="問"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            benchmark={(() => { const age = getAge(); if (!age) return undefined; const b = getBenchmark("calculation", age); return { ...b, unit: "問" }; })()}
          />
        )}
      </div>
    </div>
  );
}
