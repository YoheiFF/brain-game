"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAllPersonalBests, type GameId } from "@/lib/scores";
import { getNickname, hasNickname } from "@/lib/nickname";
import NicknameModal from "@/components/NicknameModal";

const GAMES: {
  id: GameId;
  title: string;
  description: string;
  icon: string;
  color: string;
  unit: string;
  lowerIsBetter?: boolean;
}[] = [
  { id: "calculation",    title: "計算ゲーム",     description: "60秒間で四則演算を解け！",       icon: "🧮", color: "from-violet-600 to-purple-700", unit: "問" },
  { id: "memory-number",  title: "数字記憶",       description: "数列を覚えて正確に入力しよう",   icon: "🔢", color: "from-blue-600 to-cyan-600",     unit: "桁" },
  { id: "stroop",         title: "ストループテスト", description: "文字の色に惑わされるな！",       icon: "🎨", color: "from-pink-600 to-rose-600",     unit: "点" },
  { id: "reaction",       title: "反応速度テスト",  description: "光ったらすぐにタップ！",         icon: "⚡", color: "from-yellow-500 to-orange-600",  unit: "ms", lowerIsBetter: true },
  { id: "pattern",        title: "図形記憶",       description: "光ったマスのパターンを記憶せよ", icon: "🧩", color: "from-green-600 to-teal-600",    unit: "点" },
];

export default function Home() {
  const [bests, setBests] = useState<Partial<Record<GameId, number>>>({});
  const [nickname, setNickname] = useState<string | null>(null);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [modalMode, setModalMode] = useState<"setup" | "change">("setup");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBests(getAllPersonalBests());
    const nick = getNickname();
    setNickname(nick);
    if (!hasNickname()) {
      setModalMode("setup");
      setShowNicknameModal(true);
    }
  }, []);

  const handleNicknameClose = (nick: string) => {
    setNickname(nick);
    setShowNicknameModal(false);
  };

  if (!mounted) return null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      {showNicknameModal && (
        <NicknameModal mode={modalMode} onClose={handleNicknameClose} />
      )}

      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-black text-white">🧠 BrainGame</h1>
          <p className="text-[#64748b] text-sm mt-1">脳トレゲームで思考力を鍛えよう</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {nickname && (
            <div className="flex items-center gap-2">
              <span className="text-[#64748b] text-xs">プレイヤー</span>
              <span className="text-white font-bold text-sm bg-[#1a1a2e] border border-[#2a2a4a] px-3 py-1 rounded-full">
                {nickname}
              </span>
              <button
                onClick={() => { setModalMode("change"); setShowNicknameModal(true); }}
                className="text-[#64748b] hover:text-white text-xs transition-colors"
                title="ニックネームを変更"
              >
                ✏️
              </button>
            </div>
          )}
          <Link
            href="/rankings"
            className="flex items-center gap-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-bold px-4 py-2 rounded-xl transition-all"
          >
            🏆 ランキング
          </Link>
        </div>
      </div>

      {/* ゲームカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GAMES.map((game, i) => (
          <Link
            key={game.id}
            href={`/games/${game.id}`}
            className="card p-5 hover:border-[#6c63ff] hover:scale-[1.02] transition-all duration-200 group animate-fade-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform duration-200`}>
              {game.icon}
            </div>
            <h2 className="text-lg font-bold text-white mb-1">{game.title}</h2>
            <p className="text-[#64748b] text-sm mb-3">{game.description}</p>
            {bests[game.id] !== undefined ? (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 text-xs">🏆 ベスト</span>
                <span className="text-[#6c63ff] font-bold text-sm">
                  {bests[game.id]}{game.unit}
                </span>
                {game.lowerIsBetter && <span className="text-[#64748b] text-xs">(低いほど良い)</span>}
              </div>
            ) : (
              <span className="text-[#64748b] text-xs">まだプレイ履歴なし</span>
            )}
          </Link>
        ))}
      </div>

      <p className="text-center text-[#2a2a4a] text-xs mt-10">
        スコアはこのデバイスに保存されます
      </p>
    </main>
  );
}
