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

const COLOR_MAP: Record<string, string> = {
  赤: "#ef4444",
  青: "#3b82f6",
  緑: "#22c55e",
  黄: "#eab308",
  紫: "#a855f7",
  橙: "#f97316",
};
const COLOR_KEYS = Object.keys(COLOR_MAP);

interface StroopQuestion {
  word: string;
  inkColor: string;
  correctAnswer: string;
  choices: string[];
}

function generateQuestion(): StroopQuestion {
  const word = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
  let inkColor: string;
  do {
    inkColor = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
  } while (inkColor === word);

  const correctAnswer = inkColor;
  const wrongs = COLOR_KEYS.filter((c) => c !== correctAnswer)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  const choices = [...wrongs, correctAnswer].sort(() => Math.random() - 0.5);

  return { word, inkColor, correctAnswer, choices };
}

function StroopGameInner() {
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
    ? DIFFICULTY_PARAMS.stroop[sbDifficulty]
    : DIFFICULTY_PARAMS.stroop.normal;
  const gameTime = diffParams.gameTime;

  const { pause, resume } = useBGM();
  const [phase, setPhase] = useState<Phase>("ready");
  const [question, setQuestion] = useState<StroopQuestion>(generateQuestion());
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(gameTime);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreRef = useRef(0);
  const isFreePointPlayRef = useRef(false);

  useEffect(() => {
    setBest(getPersonalBest("stroop"));
    setRemaining(getRemainingPlays("stroop"));
    setFreePoints(getFreePoints());
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => { return () => { resume(); }; }, [resume]);

  const handleSuperBrainComplete = useCallback((score: number) => {
    const passed = isPassed("stroop", sbDifficulty, score);
    const threshold = PASS_THRESHOLD["stroop"]?.[sbDifficulty] ?? 0;
    try {
      const session = loadSession();
      if (session && session.sessionId === sbSessionId) {
        const result: ChallengeResult = {
          gameId: "stroop",
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

  const endGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const s = scoreRef.current;

    if (isSuperBrain) {
      handleSuperBrainComplete(s);
      return;
    }

    setFinalScore(s);
    const isFreePointsUsed = isFreePointPlayRef.current;
    isFreePointPlayRef.current = false;
    const newBest = saveScore("stroop", s, getNickname() ?? "ゲスト", getOrInitUserId(), isFreePointsUsed);
    recordPlay("stroop", s);
    setRemaining(getRemainingPlays("stroop"));
    setFreePoints(getFreePoints());
    setBest(newBest);
    setIsNewBest(newBest === s && s > 0);
    setPhase("result");
  }, [isSuperBrain, handleSuperBrainComplete]);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setTimeLeft(gameTime);
    setFeedback(null);
    setQuestion(generateQuestion());
    setPhase("playing");
  }, [gameTime]);

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  // SuperBrainモード時は自動でカウントダウン開始
  useEffect(() => {
    if (isSuperBrain && phase === "ready") {
      startCountdown();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperBrain]);

  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { endGame(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, endGame]);

  const handleAnswer = useCallback((choice: string) => {
    if (phase !== "playing" || feedback !== null) return;
    const isCorrect = choice === question.correctAnswer;
    setFeedback(isCorrect ? "correct" : "wrong");
    if (isCorrect) {
      scoreRef.current += 1;
      setScore((s) => s + 1);
    }
    setTimeout(() => {
      setFeedback(null);
      setQuestion(generateQuestion());
    }, 300);
  }, [phase, feedback, question.correctAnswer]);

  const timerColor = timeLeft > 15 ? "text-green-400" : timeLeft > 5 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        {isSuperBrain && (
          <SuperBrainBanner
            challengeIndex={sbChallengeIndex}
            difficulty={sbDifficulty}
            gameId="stroop"
          />
        )}
        <GameHeader title="ストループテスト" description="文字の色（インクの色）を選んでください" />

        {phase === "ready" && countdown === null && !isSuperBrain && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🎨</div>
            <div className="text-center space-y-3">
              <div className="card p-4">
                <p className="text-[#64748b] text-xs mb-2">例: この文字の色は？</p>
                <p className="text-5xl font-black" style={{ color: COLOR_MAP["青"] }}>赤</p>
                <p className="text-green-400 text-sm mt-2">→ 正解は「青」(文字の色)</p>
              </div>
              <p className="text-[#64748b] text-sm">制限時間: <span className="text-white font-bold">30秒</span></p>
              {best !== null && <p className="text-[#6c63ff]">ベストスコア: <span className="font-bold">{best}点</span></p>}
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
          <div className={`card p-8 flex flex-col items-center gap-6 animate-scale-in transition-all ${
            feedback === "correct" ? "border-green-500" : feedback === "wrong" ? "border-red-500" : ""
          }`}>
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

            <div className="py-6">
              <p
                className="text-7xl font-black select-none"
                style={{ color: COLOR_MAP[question.inkColor] }}
              >
                {question.word}
              </p>
            </div>

            <p className="text-[#64748b] text-sm">↑ この文字の色は？</p>

            <div className="grid grid-cols-2 gap-3 w-full">
              {question.choices.map((choice) => (
                <button
                  key={choice}
                  onClick={() => handleAnswer(choice)}
                  className="py-4 rounded-xl font-bold text-lg transition-all active:scale-95 select-none border-2"
                  style={{
                    backgroundColor: `${COLOR_MAP[choice]}22`,
                    borderColor: COLOR_MAP[choice],
                    color: COLOR_MAP[choice],
                  }}
                >
                  {choice}
                </button>
              ))}
            </div>

            {feedback && (
              <div className={`text-lg font-bold animate-bounce-once ${feedback === "correct" ? "text-green-400" : "text-red-400"}`}>
                {feedback === "correct" ? "✓ 正解！" : "✗ 不正解"}
              </div>
            )}
          </div>
        )}

        {phase === "result" && !isSuperBrain && (
          <ResultModal
            score={finalScore}
            best={best}
            unit="個"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            benchmark={(() => { const age = getAge(); if (!age) return undefined; const b = getBenchmark("stroop", age); return { ...b, unit: "個" }; })()}
            gameId="stroop"
          />
        )}
      </div>
    </div>
  );
}

export default function StroopGame() {
  return (
    <Suspense fallback={
      <div className="game-container">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center text-[#64748b]">読み込み中...</div>
        </div>
      </div>
    }>
      <StroopGameInner />
    </Suspense>
  );
}
