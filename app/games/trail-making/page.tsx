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

interface TrailNode {
  id: number;
  x: number;
  y: number;
  tapped: boolean;
}

interface TrailLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const GAME_ID = "trail-making" as const;
const NODE_COUNT = 20;
const TIME_LIMIT_SEC = 60;
const TIME_LIMIT_MS = TIME_LIMIT_SEC * 1000;
const AREA_W = 280;
const AREA_H = 380;
const NODE_RADIUS = 20;
const MIN_DISTANCE = 55;

export default function TrailMakingGame() {
  const router = useRouter();
  const { pause, resume } = useBGM();

  const [phase, setPhase] = useState<Phase>("ready");
  const [nodes, setNodes] = useState<TrailNode[]>([]);
  const [lines, setLines] = useState<TrailLine[]>([]);
  const [nextTarget, setNextTarget] = useState<number>(1);
  const [timeLeft, setTimeLeft] = useState<number>(TIME_LIMIT_SEC);
  const [wrongId, setWrongId] = useState<number | null>(null);
  const [score, setScore] = useState<number>(0);
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
  const [freePoints, setFreePoints] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const nextTargetRef = useRef<number>(1);
  const nodesRef = useRef<TrailNode[]>([]);
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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resume]);

  function generateNodes(): TrailNode[] {
    const result: TrailNode[] = [];
    let minDist = MIN_DISTANCE;

    for (let id = 1; id <= NODE_COUNT; id++) {
      let placed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const x = NODE_RADIUS + Math.floor(Math.random() * (AREA_W - NODE_RADIUS * 2));
        const y = NODE_RADIUS + Math.floor(Math.random() * (AREA_H - NODE_RADIUS * 2));
        const tooClose = result.some((n) => Math.sqrt((x - n.x) ** 2 + (y - n.y) ** 2) < minDist);
        if (!tooClose) {
          result.push({ id, x, y, tapped: false });
          placed = true;
          break;
        }
      }
      if (!placed) {
        // MIN_DISTANCEを半分にして再試行（最大1回）
        if (minDist > MIN_DISTANCE / 2) {
          minDist = MIN_DISTANCE / 2;
          // 同じIDを再試行
          let forcePlaced = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const x = NODE_RADIUS + Math.floor(Math.random() * (AREA_W - NODE_RADIUS * 2));
            const y = NODE_RADIUS + Math.floor(Math.random() * (AREA_H - NODE_RADIUS * 2));
            const tooClose = result.some((n) => Math.sqrt((x - n.x) ** 2 + (y - n.y) ** 2) < minDist);
            if (!tooClose) {
              result.push({ id, x, y, tapped: false });
              forcePlaced = true;
              break;
            }
          }
          if (!forcePlaced) {
            // 強制配置
            result.push({ id, x: NODE_RADIUS + (id * 17) % (AREA_W - NODE_RADIUS * 2), y: NODE_RADIUS + (id * 23) % (AREA_H - NODE_RADIUS * 2), tapped: false });
          }
        } else {
          // 強制配置
          result.push({ id, x: NODE_RADIUS + (id * 17) % (AREA_W - NODE_RADIUS * 2), y: NODE_RADIUS + (id * 23) % (AREA_H - NODE_RADIUS * 2), tapped: false });
        }
      }
    }
    return result;
  }

  const timeUp = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const nickname = getNickname() ?? "ゲスト";
    const userId = getOrInitUserId();
    const isFreePointsUsed = isFreePointPlayRef.current;
    isFreePointPlayRef.current = false;
    const newBest = saveScore(GAME_ID, TIME_LIMIT_SEC, nickname, userId, isFreePointsUsed);
    recordPlay(GAME_ID, TIME_LIMIT_SEC);
    setRemaining(getRemainingPlays(GAME_ID));
    setFreePoints(getFreePoints());
    setBest(newBest);
    setScore(TIME_LIMIT_SEC);
    setIsNewBest(false);
    setPhase("result");
  }, []);

  const startGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const newNodes = generateNodes();
    nodesRef.current = newNodes;
    setNodes(newNodes);
    setLines([]);
    nextTargetRef.current = 1;
    setNextTarget(1);
    setTimeLeft(TIME_LIMIT_SEC);
    setScore(0);
    setWrongId(null);
    setIsNewBest(false);
    startTimeRef.current = Date.now();
    setPhase("playing");

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const left = Math.max(0, TIME_LIMIT_SEC - Math.floor(elapsed / 1000));
      setTimeLeft(left);
      if (elapsed >= TIME_LIMIT_MS) {
        clearInterval(timerRef.current!);
        timeUp();
      }
    }, 100);
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const { count: countdown, start: startCountdown } = useCountdown(startGame);

  const handleNodeTap = useCallback((nodeId: number) => {
    const currentTarget = nextTargetRef.current;
    if (nodeId === currentTarget) {
      // 正解
      const tappedNode = nodesRef.current.find((n) => n.id === nodeId);
      const updatedNodes = nodesRef.current.map((n) =>
        n.id === nodeId ? { ...n, tapped: true } : n
      );
      nodesRef.current = updatedNodes;
      setNodes([...updatedNodes]);

      if (currentTarget > 1) {
        const prevNode = nodesRef.current.find((n) => n.id === currentTarget - 1);
        if (prevNode && tappedNode) {
          setLines((prev) => [
            ...prev,
            { x1: prevNode.x, y1: prevNode.y, x2: tappedNode.x, y2: tappedNode.y },
          ]);
        }
      }

      if (currentTarget === NODE_COUNT) {
        // 最後のノードをタップ
        if (timerRef.current) clearInterval(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        const finalScore = parseFloat((elapsed / 1000).toFixed(1));
        const nickname = getNickname() ?? "ゲスト";
        const userId = getOrInitUserId();
        const isFreePointsUsed = isFreePointPlayRef.current;
        isFreePointPlayRef.current = false;
        const newBest = saveScore(GAME_ID, finalScore, nickname, userId, isFreePointsUsed);
        recordPlay(GAME_ID, finalScore);
        setRemaining(getRemainingPlays(GAME_ID));
        setFreePoints(getFreePoints());
        setBest(newBest);
        setIsNewBest(newBest === finalScore);
        setScore(finalScore);
        setPhase("result");
      } else {
        nextTargetRef.current = currentTarget + 1;
        setNextTarget(currentTarget + 1);
      }
    } else {
      // 誤タップ
      setWrongId(nodeId);
      setTimeout(() => setWrongId(null), 400);
    }
  }, []);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="トレイルメイキング" description="1から順番にタップしよう" />

        {phase === "ready" && countdown === null && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">✏️</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>1→2→...→20の順にタップしてください</p>
              <p>制限時間: <span className="text-white font-bold">60秒</span></p>
              <p>速く完了するほど高スコア！</p>
              {best !== null && <p className="text-[#6c63ff]">ベスト: <span className="font-bold">{best}秒</span></p>}
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
          <div className="card p-4 flex flex-col items-center gap-3 animate-scale-in">
            <div className="flex justify-between w-full text-sm">
              <span className="text-[#64748b]">次: <span className="text-white font-bold">{nextTarget}</span></span>
              <span className={`font-bold ${timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-white"}`}>
                {timeLeft}秒
              </span>
            </div>

            <div
              className="relative bg-[#0f0f1a] rounded-xl border border-[#2a2a4a] overflow-hidden"
              style={{ width: AREA_W, height: AREA_H }}
            >
              <svg
                className="absolute inset-0 pointer-events-none"
                width={AREA_W}
                height={AREA_H}
              >
                {lines.map((line, i) => (
                  <line
                    key={i}
                    x1={line.x1} y1={line.y1}
                    x2={line.x2} y2={line.y2}
                    stroke="#6c63ff"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                ))}
              </svg>

              {nodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => handleNodeTap(node.id)}
                  style={{
                    position: "absolute",
                    left: node.x - NODE_RADIUS,
                    top: node.y - NODE_RADIUS,
                    width: NODE_RADIUS * 2,
                    height: NODE_RADIUS * 2,
                  }}
                  className={`rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-150
                    ${node.tapped ? "bg-[#6c63ff] border-[#8b83ff] text-white" :
                      wrongId === node.id ? "bg-red-500 border-red-300 text-white scale-110" :
                      node.id === nextTarget ? "bg-[#1a1a2e] border-yellow-400 text-yellow-400 animate-pulse-slow" :
                      "bg-[#1a1a2e] border-[#2a2a4a] text-white"}`}
                >
                  {node.id}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={score}
            best={best}
            unit="秒"
            lowerIsBetter
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
            benchmark={(() => {
              const age = getAge();
              if (!age) return undefined;
              const b = getBenchmark(GAME_ID, age);
              return { ...b, unit: "秒", lowerIsBetter: true };
            })()}
            gameId={GAME_ID}
          />
        )}
      </div>
    </div>
  );
}
