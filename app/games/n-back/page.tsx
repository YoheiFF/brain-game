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

type Phase = "ready" | "playing" | "feedback" | "result";

const GAME_ID = "n-back" as const;
const N_LEVEL = 3;
const STIMULI_PER_ROUND = 20;
const INTERVAL_MS = 1500;
const FEEDBACK_MS = 400;

export default function NBackGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [stimuli, setStimuli] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [score, setScore] = useState<number>(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [rewardedRemaining, setRewardedRemaining] = useState(0);
  const [feedbackType, setFeedbackType] = useState<"hit" | "miss" | null>(null);
  const [responded, setResponded] = useState<boolean>(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stimuliRef = useRef<number[]>([]);
  const indexRef = useRef<number>(-1);
  const respondedRef = useRef<boolean>(false);
  const hitsRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);

  useEffect(() => {
    setBest(getPersonalBest(GAME_ID));
    setRemaining(getRemainingPlays(GAME_ID));
    setRewardedRemaining(getRewardedRemaining(GAME_ID));
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => {
    return () => {
      resume();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resume]);

  function generateStimuli(count: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      let n: number;
      do { n = Math.floor(Math.random() * 9) + 1; } while (n === result[i - 1]);
      result.push(n);
    }
    return result;
  }

  function countOpportunities(stimuli: number[], nLevel: number): number {
    let count = 0;
    for (let i = nLevel; i < stimuli.length; i++) {
      if (stimuli[i] === stimuli[i - nLevel]) {
        count++;
      }
    }
    return count;
  }

  const saveScoreAndFinish = useCallback((finalScore: number) => {
    const nickname = getNickname() ?? "ゲスト";
    const userId = getOrInitUserId();
    const newBest = saveScore(GAME_ID, finalScore, nickname, userId);
    recordPlay(GAME_ID, finalScore);
    setRemaining(getRemainingPlays(GAME_ID));
    setBest(newBest);
    setIsNewBest(newBest === finalScore && finalScore > 0);
    setPhase("result");
  }, []);

  const endRound = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const opportunities = countOpportunities(stimuliRef.current, N_LEVEL);
    const finalScore = opportunities === 0
      ? 0
      : Math.round((hitsRef.current / opportunities) * 200);
    scoreRef.current = finalScore;
    setScore(finalScore);
    saveScoreAndFinish(finalScore);
  }, [saveScoreAndFinish]);

  const startRound = useCallback(() => {
    const newStimuli = generateStimuli(STIMULI_PER_ROUND);
    stimuliRef.current = newStimuli;
    setStimuli(newStimuli);
    hitsRef.current = 0;
    indexRef.current = -1;
    respondedRef.current = false;
    setCurrentIndex(-1);
    setResponded(false);
    setFeedbackType(null);
    setPhase("playing");

    intervalRef.current = setInterval(() => {
      indexRef.current++;
      const idx = indexRef.current;
      setCurrentIndex(idx);
      respondedRef.current = false;
      setResponded(false);

      if (idx >= STIMULI_PER_ROUND) {
        clearInterval(intervalRef.current!);
        endRound();
      }
    }, INTERVAL_MS);
  }, [endRound]);

  const handleSameButton = useCallback(() => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponded(true);

    const idx = indexRef.current;

    if (idx >= N_LEVEL) {
      const isMatch = stimuliRef.current[idx] === stimuliRef.current[idx - N_LEVEL];
      if (isMatch) {
        hitsRef.current++;
        setFeedbackType("hit");
      } else {
        setFeedbackType("miss");
      }
    } else {
      setFeedbackType("miss");
    }

    setTimeout(() => setFeedbackType(null), FEEDBACK_MS);
  }, []);

  const handleStart = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    startRound();
  }, [startRound]);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="3バック課題" description="3個前と同じ数字が出たら「同じ」を押そう" />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🔄</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>数字が順番に表示されます</p>
              <p><span className="text-white font-bold">3個前</span>と同じ数字が出たら「同じ」を押してください</p>
              {best !== null && <p className="text-[#6c63ff]">ベスト: <span className="font-bold">{best}点</span></p>}
            </div>
            {remaining > 0 ? (
              <button onClick={handleStart} className="btn-primary w-full text-lg">
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

        {(phase === "playing" || phase === "feedback") && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
            <div className="flex justify-between w-full text-sm text-[#64748b]">
              <span>N = 3</span>
              <span>{currentIndex + 1} / {STIMULI_PER_ROUND}</span>
              <span>スコア: <span className="text-white font-bold">{score}</span></span>
            </div>

            <div className="w-32 h-32 rounded-2xl bg-[#1a1a2e] border-2 border-[#2a2a4a] flex items-center justify-center">
              <span className="text-6xl font-black text-white">
                {currentIndex >= 0 && currentIndex < stimuli.length ? stimuli[currentIndex] : "?"}
              </span>
            </div>

            <div className="h-8 flex items-center">
              {feedbackType === "hit" && <span className="text-green-400 font-bold text-lg">✅ 正解！</span>}
              {feedbackType === "miss" && <span className="text-red-400 font-bold text-lg">❌ 不正解</span>}
            </div>

            <button
              onClick={handleSameButton}
              disabled={responded || currentIndex < 0}
              className="btn-primary w-full text-xl py-6 disabled:opacity-40"
            >
              同じ
            </button>

            <p className="text-[#64748b] text-xs">押さない場合は「違う」とみなされます</p>
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={score}
            best={best}
            unit="点"
            isNewBest={isNewBest}
            onRetry={handleStart}
            onHome={() => router.push("/")}
            benchmark={(() => {
              const age = getAge();
              if (!age) return undefined;
              const b = getBenchmark(GAME_ID, age);
              return { ...b, unit: "点" };
            })()}
            gameId={GAME_ID}
          />
        )}
      </div>
    </div>
  );
}
