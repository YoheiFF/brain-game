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

const GAME_ID = "n-back" as const;
const N_LEVEL = 2;
const TOTAL_ROUNDS = 10;
const INTERVAL_NORMAL = 1250;
const INTERVAL_FAST = 1000;
const SPEED_UP_AT = 5;

export default function NBackGame() {
  const router = useRouter();
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
  const [rewardedRemaining, setRewardedRemaining] = useState(0);
  const [isFastMode, setIsFastMode] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<number[]>([]);
  const currentIsMatchRef = useRef<boolean>(false);
  const respondedRef = useRef<boolean>(false);
  const correctRef = useRef<number>(0);
  const missRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("ready");
  const gameEndedRef = useRef<boolean>(false);
  const isFastModeRef = useRef<boolean>(false);

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

  useEffect(() => {
    return () => {
      resume();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resume]);

  // 次の刺激を生成（50%でマッチ、即時繰り返しなし）
  function nextStimulus(history: number[]): { num: number; isMatch: boolean } {
    const prev = history[history.length - 1];

    if (history.length < N_LEVEL) {
      let n: number;
      do { n = Math.floor(Math.random() * 9) + 1; } while (n === prev);
      return { num: n, isMatch: false };
    }

    const nBack = history[history.length - N_LEVEL];

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
    const finalScore = correctRef.current * 2;
    const nickname = getNickname() ?? "ゲスト";
    const userId = getOrInitUserId();
    const newBest = saveScore(GAME_ID, finalScore, nickname, userId);
    recordPlay(GAME_ID, finalScore);
    setRemaining(getRemainingPlays(GAME_ID));
    setBest(newBest);
    setIsNewBest(newBest === finalScore && finalScore > 0);
    setScore(finalScore);
    setPhase("result");
  }, []);

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

    const { num, isMatch } = nextStimulus(historyRef.current);
    historyRef.current.push(num);
    currentIsMatchRef.current = isMatch;
    respondedRef.current = false;
    setCurrentNumber(num);
    setResponded(false);
    setFeedbackType(null);
  }, [endGame]);

  const launchInterval = useCallback((ms: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, ms);
  }, [tick]);

  const startGame = useCallback(() => {
    gameEndedRef.current = false;
    isFastModeRef.current = false;
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
    setIsFastMode(false);
    setPhase("playing");

    launchInterval(INTERVAL_NORMAL);
  }, [endGame, launchInterval]);

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
      // 正解5問到達で高速モード切り替え
      if (correctRef.current === SPEED_UP_AT && !isFastModeRef.current) {
        isFastModeRef.current = true;
        setIsFastMode(true);
        launchInterval(INTERVAL_FAST);
      }
    } else {
      missRef.current++;
      setMissCount(missRef.current);
      setFeedbackType("miss");
    }

    setTimeout(() => setFeedbackType(null), 400);
    if (correctRef.current + missRef.current >= TOTAL_ROUNDS) endGame();
  }, [endGame, launchInterval]);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="2バック課題" description="2個前と同じ数字が出たら「同じ」を押そう" />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🔄</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>数字が順番に表示されます</p>
              <p><span className="text-white font-bold">2個前</span>と同じ数字が出たら「同じ」を押してください</p>
              <p>正解 + ミス・見逃しの合計<span className="text-white font-bold">10回</span>で終了</p>
              <p>正解<span className="text-white font-bold">5問</span>で⚡高速モード（1秒）突入</p>
              <p>全問正解で<span className="text-white font-bold">満点（20点）</span></p>
              {best !== null && <p className="text-[#6c63ff]">ベスト: <span className="font-bold">{best}点</span></p>}
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
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
            <div className="flex justify-between w-full text-sm text-[#64748b]">
              <span>N = 2</span>
              <span>正解: <span className="text-white font-bold">{correctCount}</span></span>
              <span>ミス: <span className="text-red-400 font-bold">{missCount}</span></span>
              <span>残り: <span className="text-white font-bold">{TOTAL_ROUNDS - correctCount - missCount}</span></span>
            </div>
            {isFastMode && (
              <div className="text-yellow-400 font-bold text-sm animate-pulse">⚡ 高速モード！</div>
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

        {phase === "result" && (
          <ResultModal
            score={score}
            best={best}
            unit="点"
            isNewBest={isNewBest}
            onRetry={startGame}
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
