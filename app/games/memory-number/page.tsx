"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GameHeader from "@/components/GameHeader";
import ResultModal from "@/components/ResultModal";
import { saveScore, getPersonalBest } from "@/lib/scores";
import { getNickname } from "@/lib/nickname";

type Phase = "ready" | "showing" | "input" | "correct" | "wrong" | "result";

function generateSequence(length: number): number[] {
  return Array.from({ length }, () => Math.floor(Math.random() * 10));
}

const SHOW_MS_PER_DIGIT = 600;

export default function MemoryNumberGame() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(3);
  const [sequence, setSequence] = useState<number[]>([]);
  const [input, setInput] = useState("");
  const [best, setBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [showIndex, setShowIndex] = useState(-1);

  useEffect(() => {
    setBest(getPersonalBest("memory-number"));
  }, []);

  const startRound = useCallback((len: number) => {
    const seq = generateSequence(len);
    setSequence(seq);
    setInput("");
    setPhase("showing");
    setShowIndex(0);

    let i = 0;
    const tick = () => {
      i++;
      if (i < seq.length) {
        setShowIndex(i);
        setTimeout(tick, SHOW_MS_PER_DIGIT);
      } else {
        setTimeout(() => {
          setShowIndex(-1);
          setPhase("input");
        }, SHOW_MS_PER_DIGIT);
      }
    };
    setTimeout(tick, SHOW_MS_PER_DIGIT);
  }, []);

  const startGame = useCallback(() => {
    setLevel(3);
    startRound(3);
  }, [startRound]);

  const handleSubmit = useCallback(() => {
    if (phase !== "input") return;
    const correct = sequence.join("");
    if (input === correct) {
      setPhase("correct");
      setTimeout(() => {
        const next = level + 1;
        setLevel(next);
        startRound(next);
      }, 800);
    } else {
      setPhase("wrong");
      setTimeout(() => {
        const newBest = saveScore("memory-number", level, getNickname() ?? "ゲスト");
        setBest(newBest);
        setIsNewBest(newBest === level);
        setPhase("result");
      }, 1200);
    }
  }, [phase, sequence, input, level, startRound]);

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <GameHeader title="数字記憶" description="表示された数列を覚えて入力しよう" />

        {phase === "ready" && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-6xl">🔢</div>
            <div className="text-center text-[#64748b] text-sm space-y-1">
              <p>数字が順番に表示されます</p>
              <p>全て覚えて入力してください</p>
              <p>正解するごとに<span className="text-white font-bold">桁数が増えます</span></p>
              {best !== null && <p className="text-[#6c63ff]">ベストスコア: <span className="font-bold">{best}桁</span></p>}
            </div>
            <button onClick={startGame} className="btn-primary w-full text-lg">
              スタート
            </button>
          </div>
        )}

        {(phase === "showing" || phase === "input" || phase === "correct" || phase === "wrong") && (
          <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
            <div className="flex justify-between w-full">
              <span className="text-[#64748b] text-sm">レベル</span>
              <span className="text-white font-bold">{level}桁</span>
            </div>

            {phase === "showing" && (
              <>
                <p className="text-[#64748b] text-sm">覚えてください...</p>
                <div className="flex gap-3">
                  {sequence.map((n, i) => (
                    <div
                      key={i}
                      className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-black transition-all duration-200 ${
                        i === showIndex
                          ? "bg-[#6c63ff] text-white scale-110"
                          : i < showIndex
                          ? "bg-[#2a2a4a] text-[#64748b]"
                          : "bg-[#2a2a4a] text-[#2a2a4a]"
                      }`}
                    >
                      {i <= showIndex ? n : "?"}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 mt-2">
                  {sequence.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        i <= showIndex ? "bg-[#6c63ff] w-8" : "bg-[#2a2a4a] w-4"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}

            {phase === "input" && (
              <>
                <p className="text-[#64748b] text-sm">入力してください</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {sequence.map((_, i) => (
                    <div
                      key={i}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black border-2 transition-all ${
                        input[i] !== undefined
                          ? "border-[#6c63ff] bg-[#6c63ff]/10 text-white"
                          : i === input.length
                          ? "border-[#6c63ff] bg-transparent text-transparent animate-pulse"
                          : "border-[#2a2a4a] bg-transparent text-transparent"
                      }`}
                    >
                      {input[i] ?? ""}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 w-full mt-2">
                  {[1,2,3,4,5,6,7,8,9].map((n) => (
                    <button
                      key={n}
                      onClick={() => input.length < sequence.length && setInput(input + n)}
                      className="btn-secondary text-xl py-4 rounded-xl"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setInput(input.slice(0, -1))}
                    className="btn-secondary text-xl py-4 rounded-xl col-span-1"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => input.length < sequence.length && setInput(input + "0")}
                    className="btn-secondary text-xl py-4 rounded-xl"
                  >
                    0
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={input.length !== sequence.length}
                    className="btn-primary text-sm py-4 rounded-xl col-span-1 disabled:opacity-40"
                  >
                    決定
                  </button>
                </div>
              </>
            )}

            {phase === "correct" && (
              <div className="flex flex-col items-center gap-3 animate-bounce-once">
                <div className="text-5xl">✅</div>
                <p className="text-green-400 font-bold text-xl">正解！</p>
                <p className="text-[#64748b] text-sm">次は {level + 1} 桁...</p>
              </div>
            )}

            {phase === "wrong" && (
              <div className="flex flex-col items-center gap-3">
                <div className="text-5xl">❌</div>
                <p className="text-red-400 font-bold text-xl">不正解</p>
                <p className="text-[#64748b] text-sm">正解: {sequence.join(" ")}</p>
              </div>
            )}
          </div>
        )}

        {phase === "result" && (
          <ResultModal
            score={level}
            best={best}
            unit="桁"
            isNewBest={isNewBest}
            onRetry={startGame}
            onHome={() => router.push("/")}
          />
        )}
      </div>
    </div>
  );
}
