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
import { useCountdown } from "@/hooks/useCountdown";
import CountdownOverlay from "@/components/CountdownOverlay";

// ─── 型定義 ────────────────────────────────────────────────

type Phase = "ready" | "playing" | "result";
type SubPhase = "showing-number" | "showing-ops" | "answering";

type RoundOp = {
  sign: "+" | "-";
  value: number;
};

type Round = {
  initial: number;
  ops: RoundOp[];
  answer: number;
  choices: number[];
};

// ─── 定数 ──────────────────────────────────────────────────

const TOTAL_ROUNDS = 10;
const INITIAL_DISPLAY_MS = 2000;
const OP_DISPLAY_MS = 1500;
const OPS_COUNT = 9;
const CHOICE_OFFSETS = [5, 10, 15];

// ─── ユーティリティ関数 ────────────────────────────────────

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

// ─── 問題生成 ──────────────────────────────────────────────

/**
 * 4択選択肢を生成する。
 * 正解値から CHOICE_OFFSETS（5, 10, 15）ずつずれた3つのダミーを作成。
 * 各ダミーは正解と重複しないこと・0以上であることを保証。
 */
function generateChoices(answer: number): number[] {
  const distractors: number[] = [];

  for (const offset of CHOICE_OFFSETS) {
    // ランダムで+/-を決定
    let distractor = Math.random() < 0.5 ? answer + offset : answer - offset;

    // 負数になった場合は+方向に修正
    if (distractor < 0) distractor = answer + offset;

    // 正解と一致した場合（answer±offset が偶然一致する場合を防ぐ）
    if (distractor === answer) distractor = answer + offset + 1;

    distractors.push(distractor);
  }

  return shuffle([answer, ...distractors]);
}

/**
 * 1ラウンド分の問題を生成する。
 * - 初期値: 10〜30
 * - 演算: 9回、各1〜15、合計が0未満にならないよう制約
 */
function generateRound(): Round {
  const initial = randInt(10, 30);
  const ops: RoundOp[] = [];
  let running = initial;

  for (let i = 0; i < OPS_COUNT; i++) {
    const value = randInt(1, 15);
    let sign: "+" | "-" = Math.random() < 0.5 ? "+" : "-";

    // 合計が0未満にならないよう強制変更
    if (sign === "-" && running - value < 0) {
      sign = "+";
    }

    ops.push({ sign, value });
    running += sign === "+" ? value : -value;
  }

  const answer = running;
  const choices = generateChoices(answer);

  return { initial, ops, answer, choices };
}

/** 10ラウンド分の問題をまとめて生成 */
function generateAllRounds(): Round[] {
  return Array.from({ length: TOTAL_ROUNDS }, () => generateRound());
}

// ─── メインコンポーネント ───────────────────────────────────

export default function RunningTotalGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();

  // ゲーム状態
  const [phase, setPhase] = useState<Phase>("ready");
  const [subPhase, setSubPhase] = useState<SubPhase>("showing-number");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentOpIndex, setCurrentOpIndex] = useState(0);
  const [score, setScore] = useState(0);

  // リザルト用
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  // プレイ制限
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [rewardedRemaining, setRewardedRemaining] = useState(0);

  // タイマー管理（アンマウント時にクリア）
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── ライフサイクル ──────────────────────────────────────

  useEffect(() => {
    setBest(getPersonalBest("running-total"));
    setRemaining(getRemainingPlays("running-total"));
    setRewardedRemaining(getRewardedRemaining("running-total"));
  }, []);

  useEffect(() => {
    if (phase === "ready" || phase === "result") resume();
    else pause();
  }, [phase, pause, resume]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      resume();
    };
  }, [resume]);

  // ─── タイミング制御 ─────────────────────────────────────

  /**
   * 演算を opIndex 番目から開始する。
   * opIndex >= OPS_COUNT のとき answering フェーズへ遷移。
   */
  const startOps = useCallback((roundIndex: number, opIndex: number) => {
    if (opIndex >= OPS_COUNT) {
      setSubPhase("answering");
      return;
    }
    setCurrentOpIndex(opIndex);
    setSubPhase("showing-ops");
    timerRef.current = setTimeout(() => {
      startOps(roundIndex, opIndex + 1);
    }, OP_DISPLAY_MS);
  }, []);

  /**
   * 指定ラウンドを開始する。
   * 初期数字を INITIAL_DISPLAY_MS 表示後、演算フェーズへ。
   */
  const startRound = useCallback((roundIndex: number) => {
    setCurrentRound(roundIndex);
    setSubPhase("showing-number");
    timerRef.current = setTimeout(() => {
      startOps(roundIndex, 0);
    }, INITIAL_DISPLAY_MS);
  }, [startOps]);

  // ─── ゲーム制御 ─────────────────────────────────────────

  const endGame = useCallback((finalScoreValue: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFinalScore(finalScoreValue);
    const newBest = saveScore("running-total", finalScoreValue, getNickname() ?? "ゲスト", getOrInitUserId());
    recordPlay("running-total", finalScoreValue);
    setRemaining(getRemainingPlays("running-total"));
    setBest(newBest);
    setIsNewBest(newBest === finalScoreValue && finalScoreValue > 0);
    setPhase("result");
  }, []);

  const startGame = useCallback(() => {
    const newRounds = generateAllRounds();
    setRounds(newRounds);
    setScore(0);
    setCurrentRound(0);
    setPhase("playing");
    // 少し遅延してからラウンド開始（状態更新の安定のため）
    setTimeout(() => startRound(0), 50);
  }, [startRound]);

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  /**
   * 4択から回答を選択したときの処理。
   * 正解かどうか判定し、次のラウンドへ進むかゲーム終了する。
   */
  const handleAnswer = useCallback((chosen: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setScore((prevScore) => {
      const isCorrect = chosen === rounds[currentRound].answer;
      const newScore = isCorrect ? prevScore + 1 : prevScore;
      const nextRound = currentRound + 1;

      if (nextRound >= TOTAL_ROUNDS) {
        // 非同期で endGame を呼ぶ（setState内では直接呼べないため）
        setTimeout(() => endGame(newScore), 0);
      } else {
        setTimeout(() => {
          setCurrentRound(nextRound);
          startRound(nextRound);
        }, 300); // 短いフィードバック間隔
      }

      return newScore;
    });
  }, [rounds, currentRound, endGame, startRound]);

  // ─── 派生値 ─────────────────────────────────────────────

  const currentRoundData = rounds[currentRound];
  const currentOp = currentRoundData?.ops[currentOpIndex];

  // ─── レンダリング ────────────────────────────────────────

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader
          title="暗算ランニング"
          description="流れる数字を頭で計算し続けよう"
        />

        {/* ── ready フェーズ ── */}
        {phase === "ready" && countdown === null && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">📈</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>数字が次々と流れる！頭の中で計算し続けよう</p>
              <p>全 <span className="text-white font-bold">10問</span>、合計をタップで答えよう</p>
              {best !== null && (
                <p className="text-[#6c63ff]">
                  自己ベスト: <span className="font-bold">{best}問</span>
                </p>
              )}
            </div>
            {remaining > 0 ? (
              <button onClick={startCountdown} className="btn-primary w-full text-lg">
                スタート（残り{remaining}回）
              </button>
            ) : (
              <WatchAdButton
                gameId="running-total"
                rewardedRemaining={rewardedRemaining}
                onRewarded={() => {
                  setRemaining(getRemainingPlays("running-total"));
                  setRewardedRemaining(getRewardedRemaining("running-total"));
                }}
              />
            )}
          </div>
        )}

        {/* ── カウントダウンオーバーレイ ── */}
        <CountdownOverlay count={countdown} />

        {/* ── playing フェーズ ── */}
        {phase === "playing" && currentRoundData && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
            {/* 進捗・スコア表示 */}
            <div className="flex justify-between w-full">
              <div className="text-center">
                <p className="text-[#64748b] text-xs">問題</p>
                <p className="text-2xl font-black text-white">
                  {currentRound + 1}
                  <span className="text-[#64748b] text-base">/{TOTAL_ROUNDS}</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-[#64748b] text-xs">正解数</p>
                <p className="text-2xl font-black text-white">{score}</p>
              </div>
            </div>

            {/* 初期数字表示 */}
            {subPhase === "showing-number" && (
              <div className="flex flex-col items-center gap-2 animate-fade-in">
                <p className="text-[#64748b] text-sm">最初の数字</p>
                <div className="text-7xl font-black text-white py-6">
                  {currentRoundData.initial}
                </div>
                <p className="text-[#64748b] text-xs">この数字を覚えておこう</p>
              </div>
            )}

            {/* 演算表示 */}
            {subPhase === "showing-ops" && currentOp && (
              <div key={currentOpIndex} className="flex flex-col items-center gap-2 animate-fade-in">
                <p className="text-[#64748b] text-sm">
                  計算 {currentOpIndex + 1}/{OPS_COUNT}
                </p>
                <div
                  className={`text-7xl font-black py-6 ${
                    currentOp.sign === "+" ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {currentOp.sign}{currentOp.value}
                </div>
                <p className="text-[#64748b] text-xs">頭の中で計算！</p>
              </div>
            )}

            {/* 4択回答 */}
            {subPhase === "answering" && (
              <div className="flex flex-col items-center gap-4 w-full animate-fade-in">
                <p className="text-white font-bold text-lg">合計は？</p>
                <div className="grid grid-cols-2 gap-3 w-full">
                  {currentRoundData.choices.map((choice) => (
                    <button
                      key={choice}
                      onClick={() => handleAnswer(choice)}
                      className="btn-secondary py-5 text-2xl font-black hover:bg-[#6c63ff]/20 hover:border-[#6c63ff] transition-all"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── result フェーズ ── */}
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
