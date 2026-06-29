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
import { DIFFICULTY_PARAMS, PASS_THRESHOLD, isPassed, type Difficulty } from "@/lib/difficulty";
import { loadSession, saveSession, type ChallengeResult } from "@/lib/superbrain-session";
import SuperBrainBanner from "@/components/SuperBrainBanner";
import { playCorrect, playIncorrect } from "@/lib/sfx";

type Phase = "ready" | "playing" | "feedback" | "result";
type Verdict = "same" | "mirror";

const GAME_ID = "mental-rotation" as const;
const TOTAL_QUESTIONS = 20;
const FEEDBACK_DURATION_MS = 500;
const HALF_QUESTIONS = 10;
const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

const SHAPES: { id: number; points: string }[] = [
  // L字（左縦棒＋右への足）
  { id: 1, points: "15,10 15,85 60,85 60,65 35,65 35,10 15,10" },
  // J字（右縦棒＋左への足）
  { id: 2, points: "85,10 85,85 40,85 40,65 65,65 65,10 85,10" },
  // 幅広L字（足が長い）
  { id: 3, points: "10,10 10,85 70,85 70,55 30,55 30,10 10,10" },
  // 段差L字（右側に切り込みあり）
  { id: 4, points: "15,10 15,85 60,85 60,50 40,50 40,30 60,30 60,10 15,10" },
  // 横L字（上バー＋左足）
  { id: 5, points: "15,15 15,85 45,85 45,45 75,45 75,15 15,15" },
  // 短L字（左太棒＋右低足）
  { id: 6, points: "20,20 20,80 60,80 60,60 40,60 40,20 20,20" },
  // F字（縦棒＋上腕＋中腕、非対称）
  { id: 7, points: "10,10 80,10 80,30 30,30 30,45 65,45 65,65 30,65 30,90 10,90 10,10" },
  // Z字（上右ブロック＋下左ブロック、非対称）
  { id: 8, points: "40,10 85,10 85,40 60,40 60,90 15,90 15,60 40,60 40,10" },
];

function MentalRotationGameInner() {
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
    ? DIFFICULTY_PARAMS["mental-rotation"][sbDifficulty]
    : DIFFICULTY_PARAMS["mental-rotation"].normal;
  const TIME_FIRST_HALF_MS = diffParams.timeFirstHalfMs;
  const TIME_SECOND_HALF_MS = diffParams.timeSecondHalfMs;

  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [currentShape, setCurrentShape] = useState<{ id: number; points: string } | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [lastVerdict, setLastVerdict] = useState<"correct" | "wrong" | "timeout" | null>(null);
  const [timeProgress, setTimeProgress] = useState<number>(100);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);
  const [score, setScore] = useState<number>(0);
  const [questionNum, setQuestionNum] = useState<number>(0);

  const correctCountRef = useRef<number>(0);
  const questionNumRef = useRef<number>(0);
  const isFlippedRef = useRef<boolean>(false);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef<number>(0);
  const answeredRef = useRef<boolean>(false);
  const deckRef = useRef<typeof SHAPES>([]);
  const isFreePointPlayRef = useRef(false);

  useEffect(() => {
    setBest(getPersonalBest(GAME_ID));
    setRemaining(getRemainingPlays(GAME_ID));
    setFreePoints(getFreePoints());
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => {
    return () => {
      resume();
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [resume]);

  const handleSuperBrainComplete = useCallback((finalScore: number) => {
    const passed = isPassed(GAME_ID, sbDifficulty, finalScore);
    const threshold = PASS_THRESHOLD[GAME_ID]?.[sbDifficulty] ?? 0;
    try {
      const session = loadSession();
      if (session && session.sessionId === sbSessionId) {
        const result: ChallengeResult = {
          gameId: GAME_ID,
          difficulty: sbDifficulty,
          score: finalScore,
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

  function pickNextShape(): typeof SHAPES[0] {
    if (deckRef.current.length === 0) {
      deckRef.current = [...SHAPES].sort(() => Math.random() - 0.5);
    }
    return deckRef.current.pop()!;
  }

  function applyNextQuestion() {
    const shape = pickNextShape();
    const rotation = ROTATIONS[Math.floor(Math.random() * ROTATIONS.length)];
    const flipped = Math.random() < 0.5;
    isFlippedRef.current = flipped;
    setCurrentShape(shape);
    setRotation(rotation);
    setIsFlipped(flipped);
  }

  const endGame = useCallback(() => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    const finalScore = correctCountRef.current;

    if (isSuperBrain) {
      handleSuperBrainComplete(finalScore);
      return;
    }

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
  }, [isSuperBrain, handleSuperBrainComplete]);

  const nextQuestion = useCallback(() => {
    applyNextQuestion();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startQuestionTimer = useCallback(() => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    answeredRef.current = false;
    questionStartRef.current = Date.now();
    setTimeProgress(100);

    const timeLimit = questionNumRef.current <= HALF_QUESTIONS ? TIME_FIRST_HALF_MS : TIME_SECOND_HALF_MS;

    questionTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - questionStartRef.current;
      const progress = Math.max(0, 1 - elapsed / timeLimit);
      setTimeProgress(progress * 100);

      if (elapsed >= timeLimit) {
        clearInterval(questionTimerRef.current!);
        if (answeredRef.current) return;
        answeredRef.current = true;
        setLastVerdict("timeout");
        playIncorrect();
        setPhase("feedback");

        setTimeout(() => {
          if (questionNumRef.current >= TOTAL_QUESTIONS) {
            endGame();
          } else {
            questionNumRef.current++;
            setQuestionNum(questionNumRef.current);
            applyNextQuestion();
            setPhase("playing");
          }
        }, FEEDBACK_DURATION_MS);
      }
    }, 50);
  }, [endGame, TIME_FIRST_HALF_MS, TIME_SECOND_HALF_MS]);

  useEffect(() => {
    if (phase === "playing") startQuestionTimer();
  }, [phase, startQuestionTimer]);

  const startGame = useCallback(() => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    correctCountRef.current = 0;
    questionNumRef.current = 1;
    deckRef.current = [];
    setCorrectCount(0);
    setQuestionNum(1);
    setScore(0);
    setLastVerdict(null);
    setIsNewBest(false);
    applyNextQuestion();
    setPhase("playing");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SuperBrainモード時は自動でゲーム開始
  useEffect(() => {
    if (isSuperBrain && phase === "ready") {
      startGame();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperBrain]);

  const handleAnswer = useCallback((verdict: Verdict) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);

    const isCorrect = isFlippedRef.current ? verdict === "mirror" : verdict === "same";

    if (isCorrect) {
      correctCountRef.current++;
      setCorrectCount(correctCountRef.current);
      setLastVerdict("correct");
      playCorrect();
    } else {
      setLastVerdict("wrong");
      playIncorrect();
    }

    setPhase("feedback");

    setTimeout(() => {
      if (questionNumRef.current >= TOTAL_QUESTIONS) {
        endGame();
      } else {
        questionNumRef.current++;
        setQuestionNum(questionNumRef.current);
        nextQuestion();
        setPhase("playing");
      }
    }, FEEDBACK_DURATION_MS);
  }, [endGame, nextQuestion]);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        {isSuperBrain && (
          <SuperBrainBanner
            challengeIndex={sbChallengeIndex}
            difficulty={sbDifficulty}
            gameId="mental-rotation"
          />
        )}
        <GameHeader title="心的回転" description="図形が同じか鏡像かを判断しよう" />

        {phase === "ready" && !isSuperBrain && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🔃</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>図形が<span className="text-white font-bold">同じ向き</span>か<span className="text-white font-bold">鏡像</span>かを判断してください</p>
              <p>前半10問: <span className="text-white font-bold">3秒</span> → 後半10問: <span className="text-orange-400 font-bold">2秒</span></p>
              <p>全<span className="text-white font-bold">{TOTAL_QUESTIONS}問</span>中何問正解できるか！</p>
              {best !== null && <p className="text-[#6c63ff]">ベストスコア: <span className="font-bold">{best}問</span></p>}
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

        {(phase === "playing" || phase === "feedback") && (
          <div className="card p-6 flex flex-col items-center gap-4 animate-scale-in">
            <div className="flex justify-between w-full text-sm">
              <span className="text-[#64748b]">正解: <span className="text-white font-bold">{correctCount}</span></span>
              <span className={`font-bold ${questionNum > HALF_QUESTIONS ? "text-orange-400" : "text-[#64748b]"}`}>
                {questionNum}/{TOTAL_QUESTIONS}問
                {questionNum > HALF_QUESTIONS && <span className="text-xs ml-1">⚡後半</span>}
              </span>
            </div>

            {/* タイムバー */}
            <div className="w-full h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-none ${timeProgress > 40 ? "bg-[#6c63ff]" : timeProgress > 20 ? "bg-yellow-400" : "bg-red-500"}`}
                style={{ width: `${timeProgress}%` }}
              />
            </div>

            <div className="flex gap-3 w-full items-end">
              {/* 基準図形 */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[#64748b] text-xs">基準</span>
                <div className="w-full aspect-square flex items-center justify-center bg-[#0f0f1a] rounded-xl border border-[#2a2a4a]">
                  {currentShape && (
                    <svg viewBox="0 0 100 100" width="100%" height="100%" className="overflow-visible p-2">
                      <polygon points={currentShape.points} fill="#334155" stroke="#64748b" strokeWidth="2" />
                    </svg>
                  )}
                </div>
              </div>

              <span className="text-[#64748b] text-xl pb-4">=?</span>

              {/* 判定対象図形 */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[#6c63ff] text-xs font-bold">これは？</span>
                <div className="w-full aspect-square flex items-center justify-center bg-[#0f0f1a] rounded-xl border-2 border-[#6c63ff]">
                  {currentShape && (
                    <svg viewBox="0 0 100 100" width="100%" height="100%" className="overflow-visible p-2">
                      <g transform={`rotate(${rotation}, 50, 50) scale(${isFlipped ? -1 : 1}, 1) translate(${isFlipped ? -100 : 0}, 0)`}>
                        <polygon points={currentShape.points} fill="#6c63ff" stroke="#8b83ff" strokeWidth="2" />
                      </g>
                    </svg>
                  )}
                </div>
              </div>
            </div>

            <div className="h-7 flex items-center">
              {phase === "feedback" && lastVerdict === "correct" && (
                <span className="text-green-400 font-bold text-lg">✅ 正解！</span>
              )}
              {phase === "feedback" && lastVerdict === "wrong" && (
                <span className="text-red-400 font-bold text-lg">❌ 不正解</span>
              )}
              {phase === "feedback" && lastVerdict === "timeout" && (
                <span className="text-yellow-400 font-bold text-lg">⏱ 時間切れ</span>
              )}
            </div>

            <div className="flex gap-4 w-full">
              <button
                onClick={() => handleAnswer("same")}
                disabled={phase === "feedback"}
                className="flex-1 btn-primary py-4 disabled:opacity-40"
              >
                同じ
              </button>
              <button
                onClick={() => handleAnswer("mirror")}
                disabled={phase === "feedback"}
                className="flex-1 btn-secondary py-4 disabled:opacity-40"
              >
                鏡像
              </button>
            </div>
          </div>
        )}

        {phase === "result" && !isSuperBrain && (
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

export default function MentalRotationGame() {
  return (
    <Suspense fallback={
      <div className="game-container">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center text-[#64748b]">読み込み中...</div>
        </div>
      </div>
    }>
      <MentalRotationGameInner />
    </Suspense>
  );
}
