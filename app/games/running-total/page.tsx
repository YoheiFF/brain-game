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
type SubPhase = "showing-number" | "showing-ops" | "answering";

type RoundOp = { sign: "+" | "-"; value: number };
type Round = { initial: number; ops: RoundOp[]; answer: number; choices: number[] };
type Stage = { threshold: number; initialMs: number; opMs: number; answerSec: number; opsCount: number; label: string | null };

const TOTAL_ROUNDS = 10;
const CHOICE_OFFSETS = [5, 10, 15];

const STAGES: Stage[] = [
  { threshold: 0, initialMs: 1500, opMs: 1500, answerSec: 3, opsCount: 4, label: null },
  { threshold: 2, initialMs: 1500, opMs: 1000, answerSec: 3, opsCount: 4, label: "⚡ 高速" },
  { threshold: 5, initialMs: 1000, opMs:  700, answerSec: 3, opsCount: 4, label: "⚡⚡ 超高速" },
  { threshold: 8, initialMs: 1000, opMs:  700, answerSec: 3, opsCount: 8, label: "💪 高難度" },
];

function getStage(score: number): Stage {
  let stage = STAGES[0];
  for (const s of STAGES) { if (score >= s.threshold) stage = s; }
  return stage;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateChoices(answer: number): number[] {
  const distractors: number[] = [];
  for (const offset of CHOICE_OFFSETS) {
    let d = Math.random() < 0.5 ? answer + offset : answer - offset;
    if (d < 0) d = answer + offset;
    if (d === answer) d = answer + offset + 1;
    distractors.push(d);
  }
  return shuffle([answer, ...distractors]);
}

function generateRound(opsCount: number): Round {
  const initial = randInt(10, 30);
  const ops: RoundOp[] = [];
  let running = initial;
  for (let i = 0; i < opsCount; i++) {
    const value = randInt(1, 15);
    let sign: "+" | "-" = Math.random() < 0.5 ? "+" : "-";
    if (sign === "-" && running - value < 0) sign = "+";
    ops.push({ sign, value });
    running += sign === "+" ? value : -value;
  }
  return { initial, ops, answer: running, choices: generateChoices(running) };
}

export default function RunningTotalGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [subPhase, setSubPhase] = useState<SubPhase>("showing-number");
  const [rounds, setRounds] = useState<(Round | undefined)[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentOpIndex, setCurrentOpIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [currentStage, setCurrentStage] = useState<Stage>(STAGES[0]);
  const [answerTimeLeft, setAnswerTimeLeft] = useState(STAGES[0].answerSec);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);

  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundsRef = useRef<(Round | undefined)[]>([]);
  const currentRoundRef = useRef(0);
  const scoreRef = useRef(0);
  const currentStageRef = useRef<Stage>(STAGES[0]);
  const isFreePointPlayRef = useRef(false);

  useEffect(() => {
    setBest(getPersonalBest("running-total"));
    setRemaining(getRemainingPlays("running-total"));
    setFreePoints(getFreePoints());
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (answerIntervalRef.current) clearInterval(answerIntervalRef.current);
      resume();
    };
  }, [resume]);

  // answering 開始時に現在ステージの answerSec でカウントダウン
  useEffect(() => {
    if (subPhase !== "answering") return;
    const sec = currentStageRef.current.answerSec;
    setAnswerTimeLeft(sec);

    const interval = setInterval(() => {
      setAnswerTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    answerIntervalRef.current = interval;

    return () => clearInterval(interval);
  }, [subPhase]);

  const startOps = useCallback((roundIndex: number, opIndex: number) => {
    const opsCount = roundsRef.current[roundIndex]?.ops.length ?? currentStageRef.current.opsCount;
    if (opIndex >= opsCount) {
      setSubPhase("answering");
      return;
    }
    setCurrentOpIndex(opIndex);
    setSubPhase("showing-ops");
    timerRef.current = setTimeout(() => {
      startOps(roundIndex, opIndex + 1);
    }, currentStageRef.current.opMs);
  }, []);

  const startRound = useCallback((roundIndex: number) => {
    // ラウンド開始時に現在ステージのopsCountで問題を生成
    const stage = currentStageRef.current;
    const newRound = generateRound(stage.opsCount);
    roundsRef.current[roundIndex] = newRound;
    setRounds(prev => { const u = [...prev]; u[roundIndex] = newRound; return u; });
    setCurrentRound(roundIndex);
    currentRoundRef.current = roundIndex;
    setSubPhase("showing-number");
    timerRef.current = setTimeout(() => {
      startOps(roundIndex, 0);
    }, stage.initialMs);
  }, [startOps]);

  const endGame = useCallback((finalScoreValue: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (answerIntervalRef.current) clearInterval(answerIntervalRef.current);
    setFinalScore(finalScoreValue);
    const isFreePointsUsed = isFreePointPlayRef.current;
    isFreePointPlayRef.current = false;
    const newBest = saveScore("running-total", finalScoreValue, getNickname() ?? "ゲスト", getOrInitUserId(), isFreePointsUsed);
    recordPlay("running-total", finalScoreValue);
    setRemaining(getRemainingPlays("running-total"));
    setFreePoints(getFreePoints());
    setBest(newBest);
    setIsNewBest(newBest === finalScoreValue && finalScoreValue > 0);
    setPhase("result");
  }, []);

  const handleAnswer = useCallback((chosen: number | null) => {
    if (answerIntervalRef.current) clearInterval(answerIntervalRef.current);

    const round = roundsRef.current[currentRoundRef.current];
    if (!round) return;

    const isCorrect = chosen !== null && chosen === round.answer;
    setSelectedChoice(chosen);
    setFeedback(isCorrect ? "correct" : "incorrect");

    setScore((prev) => {
      const newScore = isCorrect ? prev + 1 : prev;
      scoreRef.current = newScore;
      const newStage = getStage(newScore);
      if (newStage !== currentStageRef.current) {
        currentStageRef.current = newStage;
        setCurrentStage(newStage);
      }
      return newScore;
    });

    setTimeout(() => {
      setFeedback(null);
      setSelectedChoice(null);
      const nextRound = currentRoundRef.current + 1;
      if (nextRound >= TOTAL_ROUNDS) {
        endGame(scoreRef.current);
      } else {
        startRound(nextRound);
      }
    }, 800);
  }, [endGame, startRound]);

  const handleAnswerRef = useRef(handleAnswer);
  handleAnswerRef.current = handleAnswer;

  useEffect(() => {
    if (answerTimeLeft === 0 && subPhase === "answering" && feedback === null) {
      handleAnswerRef.current(null);
    }
  }, [answerTimeLeft, subPhase, feedback]);

  const startGame = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (answerIntervalRef.current) clearInterval(answerIntervalRef.current);
    scoreRef.current = 0;
    currentStageRef.current = STAGES[0];
    roundsRef.current = [];
    setRounds([]);
    setScore(0);
    setCurrentRound(0);
    setCurrentStage(STAGES[0]);
    setFeedback(null);
    setSelectedChoice(null);
    setPhase("playing");
    setTimeout(() => startRound(0), 50);
  }, [startRound]);

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  const currentRoundData = rounds[currentRound];
  const currentOp = currentRoundData?.ops[currentOpIndex];
  const opsCount = currentRoundData?.ops.length ?? currentStageRef.current.opsCount;

  const timerColor =
    answerTimeLeft > 2 ? "text-white" :
    answerTimeLeft > 1 ? "text-yellow-400" :
    "text-red-400";

  const getButtonStyle = (choice: number) => {
    if (feedback === null) {
      return "btn-secondary py-5 text-2xl font-black hover:bg-[#6c63ff]/20 hover:border-[#6c63ff] transition-all";
    }
    if (choice === currentRoundData?.answer) {
      return "py-5 text-2xl font-black rounded-xl border-2 bg-green-500/20 border-green-500 text-green-400 transition-all";
    }
    if (choice === selectedChoice) {
      return "py-5 text-2xl font-black rounded-xl border-2 bg-red-500/20 border-red-500 text-red-400 transition-all";
    }
    return "py-5 text-2xl font-black rounded-xl border-2 bg-[#1a1a2e] border-[#2a2a4a] text-[#64748b] transition-all";
  };

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="暗算ランニング" description="流れる数字を頭で計算し続けよう" />

        {phase === "ready" && countdown === null && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">📈</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>数字が次々と流れる！頭の中で計算し続けよう</p>
              <p>全 <span className="text-white font-bold">10問</span>、合計をタップで答えよう</p>
              <p>正解が増えるほど難易度が上昇！</p>
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

        {phase === "playing" && currentRoundData && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
            <div className="flex justify-between w-full items-center">
              <div className="text-center">
                <p className="text-[#64748b] text-xs">問題</p>
                <p className="text-2xl font-black text-white">
                  {currentRound + 1}<span className="text-[#64748b] text-base">/{TOTAL_ROUNDS}</span>
                </p>
              </div>
              {currentStage.label && (
                <span className="text-yellow-400 text-xs font-bold animate-pulse">{currentStage.label}</span>
              )}
              <div className="text-center">
                <p className="text-[#64748b] text-xs">正解数</p>
                <p className="text-2xl font-black text-white">{score}</p>
              </div>
            </div>

            {subPhase === "showing-number" && (
              <div className="flex flex-col items-center gap-2 animate-fade-in">
                <p className="text-[#64748b] text-sm">最初の数字</p>
                <div className="text-7xl font-black text-white py-6">{currentRoundData.initial}</div>
                <p className="text-[#64748b] text-xs">この数字を覚えておこう</p>
              </div>
            )}

            {subPhase === "showing-ops" && currentOp && (
              <div key={currentOpIndex} className="flex flex-col items-center gap-2 animate-fade-in">
                <p className="text-[#64748b] text-sm">計算 {currentOpIndex + 1}/{opsCount}</p>
                <div className={`text-7xl font-black py-6 ${currentOp.sign === "+" ? "text-green-400" : "text-red-400"}`}>
                  {currentOp.sign}{currentOp.value}
                </div>
                <p className="text-[#64748b] text-xs">頭の中で計算！</p>
              </div>
            )}

            {subPhase === "answering" && (
              <div className="flex flex-col items-center gap-4 w-full animate-fade-in">
                <div className="flex justify-between w-full items-center">
                  <p className="text-white font-bold text-lg">合計は？</p>
                  <p className={`text-2xl font-black ${timerColor}`}>{answerTimeLeft}s</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full">
                  {currentRoundData.choices.map((choice) => (
                    <button
                      key={choice}
                      onClick={() => feedback === null && handleAnswer(choice)}
                      disabled={feedback !== null}
                      className={getButtonStyle(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                {feedback !== null && (
                  <p className={`text-lg font-bold animate-fade-in ${feedback === "correct" ? "text-green-400" : "text-red-400"}`}>
                    {feedback === "correct" ? "正解！" : selectedChoice === null ? "時間切れ！" : "不正解..."}
                  </p>
                )}
              </div>
            )}
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
            benchmark={(() => {
              const age = getAge();
              if (!age) return undefined;
              const b = getBenchmark("running-total", age);
              return { ...b, unit: "問" };
            })()}
            gameId="running-total"
          />
        )}
      </div>
    </div>
  );
}
