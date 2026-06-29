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
import { playCorrect, playIncorrect } from "@/lib/sfx";

type Phase = "ready" | "playing" | "result";

const GAME_ID = "n-back" as const;
const TOTAL_ROUNDS = 20;

// 正解数に応じた速度ステージ（通常モード基準）
const SPEED_STAGES_BASE = [
  { threshold: 0,  ms: 1100, label: "通常" },
  { threshold: 10, ms: 900,  label: "⚡ 高速モード！" },
  { threshold: 15, ms: 700,  label: "⚡⚡ 超高速！" },
] as const;

function getStageIndex(correct: number): number {
  let stage = 0;
  for (let i = 0; i < SPEED_STAGES_BASE.length; i++) {
    if (correct >= SPEED_STAGES_BASE[i].threshold) stage = i;
  }
  return stage;
}

function NBackGameInner() {
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
    ? DIFFICULTY_PARAMS["n-back"][sbDifficulty]
    : DIFFICULTY_PARAMS["n-back"].normal;
  const N_LEVEL = diffParams.nLevel;
  const speedMultiplier = diffParams.speedMultiplier;

  // speedMultiplier を適用した速度ステージ
  const SPEED_STAGES = SPEED_STAGES_BASE.map((s) => ({
    ...s,
    ms: Math.round(s.ms / speedMultiplier),
  }));

  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [score, setScore] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [missCount, setMissCount] = useState<number>(0);
  const [feedbackType, setFeedbackType] = useState<"hit" | "miss" | null>(null);
  const [responded, setResponded] = useState<boolean>(false);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);
  const [speedStage, setSpeedStage] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<number[]>([]);
  const currentIsMatchRef = useRef<boolean>(false);
  const respondedRef = useRef<boolean>(false);
  const correctRef = useRef<number>(0);
  const missRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("ready");
  const gameEndedRef = useRef<boolean>(false);
  const speedStageRef = useRef<number>(0);
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

  useEffect(() => {
    return () => {
      resume();
      if (intervalRef.current) clearInterval(intervalRef.current);
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

  // 次の刺激を生成（50%でマッチ、即時繰り返しなし）
  function nextStimulus(history: number[], nLevel: number): { num: number; isMatch: boolean } {
    const prev = history[history.length - 1];

    if (history.length < nLevel) {
      let n: number;
      do { n = Math.floor(Math.random() * 9) + 1; } while (n === prev);
      return { num: n, isMatch: false };
    }

    const nBack = history[history.length - nLevel];

    // 50%でマッチ（即時繰り返しにならない場合のみ）
    if (Math.random() < 0.5 && nBack !== prev) {
      return { num: nBack, isMatch: true };
    }

    // ノンマッチ: prev と nBack 両方を避ける
    let n: number;
    do { n = Math.floor(Math.random() * 9) + 1; } while (n === prev || n === nBack);
    return { num: n, isMatch: false };
  }

  const endGame = useCallback(() => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const finalScore = correctRef.current;

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

  const tick = useCallback(() => {
    if (gameEndedRef.current) return;

    // 前の刺激がマッチで未回答 → 見逃し
    if (currentIsMatchRef.current && !respondedRef.current && historyRef.current.length >= N_LEVEL) {
      missRef.current++;
      setMissCount(missRef.current);
      if (correctRef.current + missRef.current >= TOTAL_ROUNDS) {
        endGame(); return;
      }
    }

    const { num, isMatch } = nextStimulus(historyRef.current, N_LEVEL);
    historyRef.current.push(num);
    currentIsMatchRef.current = isMatch;
    respondedRef.current = false;
    setCurrentNumber(num);
    setResponded(false);
    setFeedbackType(null);
  }, [endGame, N_LEVEL]);

  const launchInterval = useCallback((ms: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, ms);
  }, [tick]);

  const startGame = useCallback(() => {
    gameEndedRef.current = false;
    speedStageRef.current = 0;
    historyRef.current = [];
    currentIsMatchRef.current = false;
    respondedRef.current = false;
    correctRef.current = 0;
    missRef.current = 0;

    setCurrentNumber(null);
    setScore(0);
    setCorrectCount(0);
    setMissCount(0);
    setFeedbackType(null);
    setResponded(false);
    setIsNewBest(false);
    setSpeedStage(0);
    setPhase("playing");

    launchInterval(SPEED_STAGES[0].ms);
  }, [endGame, launchInterval, SPEED_STAGES]);

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  // SuperBrainモード時は自動でカウントダウン開始
  useEffect(() => {
    if (isSuperBrain && phase === "ready") {
      startCountdown();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperBrain]);

  const handleSameButton = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (respondedRef.current) return;
    if (historyRef.current.length === 0) return;
    respondedRef.current = true;
    setResponded(true);

    const canMatch = historyRef.current.length >= N_LEVEL + 1;
    if (canMatch && currentIsMatchRef.current) {
      correctRef.current++;
      setCorrectCount(correctRef.current);
      setFeedbackType("hit");
      playCorrect();

      // 正解数に応じて速度ステージを更新
      const newStage = getStageIndex(correctRef.current);
      if (newStage > speedStageRef.current) {
        speedStageRef.current = newStage;
        setSpeedStage(newStage);
        launchInterval(SPEED_STAGES[newStage].ms);
      }
    } else {
      missRef.current++;
      setMissCount(missRef.current);
      setFeedbackType("miss");
      playIncorrect();
    }

    setTimeout(() => setFeedbackType(null), 400);
    if (correctRef.current + missRef.current >= TOTAL_ROUNDS) endGame();
  }, [endGame, launchInterval, N_LEVEL, SPEED_STAGES]);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        {isSuperBrain && (
          <SuperBrainBanner
            challengeIndex={sbChallengeIndex}
            difficulty={sbDifficulty}
            gameId="n-back"
          />
        )}
        <GameHeader title={`${N_LEVEL}バック課題`} description={`${N_LEVEL}個前と同じ数字が出たら「同じ」を押そう`} />

        {phase === "ready" && countdown === null && !isSuperBrain && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🔄</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>数字が順番に表示されます</p>
              <p><span className="text-white font-bold">{N_LEVEL}個前</span>と同じ数字が出たら「同じ」を押してください</p>
              <p>正解 + ミス・見逃しの合計<span className="text-white font-bold">20回</span>で終了</p>
              <p>正解<span className="text-white font-bold">10問</span>で⚡高速モード（1秒）</p>
              <p>正解<span className="text-white font-bold">15問</span>で⚡⚡超高速（0.8秒）</p>
              <p>全問正解で<span className="text-white font-bold">最高（20問）</span></p>
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
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
            <div className="flex justify-between w-full text-sm text-[#64748b]">
              <span>N = {N_LEVEL}</span>
              <span>正解: <span className="text-white font-bold">{correctCount}</span></span>
              <span>ミス: <span className="text-red-400 font-bold">{missCount}</span></span>
              <span>残り: <span className="text-white font-bold">{TOTAL_ROUNDS - correctCount - missCount}</span></span>
            </div>
            {speedStage > 0 && (
              <div className={`font-bold text-sm animate-pulse ${speedStage >= 2 ? "text-orange-400" : "text-yellow-400"}`}>
                {SPEED_STAGES[speedStage].label}
              </div>
            )}

            <div className="w-32 h-32 rounded-2xl bg-[#1a1a2e] border-2 border-[#2a2a4a] flex items-center justify-center">
              <span className="text-6xl font-black text-white">
                {currentNumber ?? "?"}
              </span>
            </div>

            <div className="h-8 flex items-center">
              {feedbackType === "hit" && <span className="text-green-400 font-bold text-lg">✅ 正解！</span>}
              {feedbackType === "miss" && <span className="text-red-400 font-bold text-lg">❌ 不正解</span>}
            </div>

            <button
              onClick={handleSameButton}
              disabled={responded || currentNumber === null}
              className="btn-primary w-full text-xl py-6 disabled:opacity-40"
            >
              同じ
            </button>

            <p className="text-[#64748b] text-xs">押さない場合は「違う」とみなされます</p>
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

export default function NBackGame() {
  return (
    <Suspense fallback={
      <div className="game-container">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center text-[#64748b]">読み込み中...</div>
        </div>
      </div>
    }>
      <NBackGameInner />
    </Suspense>
  );
}
