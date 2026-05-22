"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAllPersonalBests, type GameId, GAME_IDS } from "@/lib/scores";
import { calcGamePoints } from "@/lib/game-points";
import { getNickname, hasNickname, getAge, getUserId } from "@/lib/nickname";
import NicknameModal from "@/components/NicknameModal";
import { getBenchmark } from "@/lib/benchmarks";
import { getAllRemainingPlays, MAX_PLAYS_PER_DAY } from "@/lib/daily";
import { useDbSync } from "@/hooks/useDbSync";

const GAMES: {
  id: GameId;
  title: string;
  description: string;
  icon: string;
  color: string;
  unit: string;
  lowerIsBetter?: boolean;
}[] = [
  { id: "calculation",    title: "計算ゲーム",     description: "30秒間で四則演算を解け！",       icon: "🧮", color: "from-violet-600 to-purple-700", unit: "問" },
  { id: "memory-number",  title: "数字記憶",       description: "数列を覚えて正確に入力しよう",   icon: "🔢", color: "from-blue-600 to-cyan-600",     unit: "桁" },
  { id: "stroop",         title: "ストループ", description: "文字の色に惑わされるな！",       icon: "🎨", color: "from-pink-600 to-rose-600",     unit: "個" },
  { id: "reaction",       title: "反応速度テスト",  description: "光ったらすぐにタップ！",         icon: "⚡", color: "from-yellow-500 to-orange-600",  unit: "ms", lowerIsBetter: true },
  { id: "pattern",        title: "図形記憶",       description: "光ったマスのパターンを記憶せよ", icon: "🧩", color: "from-green-600 to-teal-600",    unit: "個" },
  { id: "n-back",          title: "2バック課題",      description: "2個前と同じ数字か判断せよ！",      icon: "🔄", color: "from-indigo-600 to-blue-700",   unit: "点" },
  { id: "dual-task",       title: "注意分割タスク",    description: "左右の刺激に同時に反応しよう",      icon: "👁", color: "from-cyan-600 to-teal-600",     unit: "問" },
  { id: "trail-making",    title: "トレイルメイキング", description: "数字を順番にタップせよ！",          icon: "✏️", color: "from-orange-500 to-red-600",    unit: "秒", lowerIsBetter: true },
  { id: "mental-rotation", title: "心的回転",          description: "図形が同じか鏡像かを判断しよう",    icon: "🔃", color: "from-emerald-500 to-green-700", unit: "点" },
  { id: "running-total",   title: "暗算ランニング",     description: "流れる数字を頭で足し引き！合計を当てろ", icon: "📈", color: "from-teal-600 to-cyan-700",     unit: "問" },
];

export default function Home() {
  const [bests, setBests] = useState<Partial<Record<GameId, number>>>({});
  const [nickname, setNickname] = useState<string | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [remainingPlays, setRemainingPlays] = useState<Partial<Record<GameId, number>>>({});
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [modalMode, setModalMode] = useState<"setup" | "change">("setup");
  const [mounted, setMounted] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ホームはポーリングなし（初回フェッチのみ）
  const { data: syncData, loading: syncLoading } = useDbSync({ interval: null });

  useEffect(() => {
    setMounted(true);
    setBests(getAllPersonalBests());
    const nick = getNickname();
    setNickname(nick);
    setAge(getAge());
    setRemainingPlays(getAllRemainingPlays());
    if (!hasNickname()) {
      setModalMode("setup");
      setShowNicknameModal(true);
    }

    // フレンド申請バッジ
    const uid = getUserId();
    if (uid) {
      fetch(`/api/friends/pending?userId=${uid}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data: { requesterId: string }[]) => setPendingCount(data.length))
        .catch(() => {});
    }
  }, []);

  // syncData が届いたら DB データで上書き
  useEffect(() => {
    if (!syncData) return;
    setBests(syncData.personalBests);
    // dailyPlays を remainingPlays に変換
    const remaining: Partial<Record<GameId, number>> = {};
    for (const id of GAME_IDS) {
      const play = syncData.dailyPlays[id];
      remaining[id] = Math.max(0, MAX_PLAYS_PER_DAY - (play?.playCount ?? 0));
    }
    setRemainingPlays(remaining);
  }, [syncData]);

  const handleNicknameClose = (nick: string) => {
    setNickname(nick);
    setAge(getAge());
    setShowNicknameModal(false);
  };

  if (!mounted) return null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      {showNicknameModal && (
        <NicknameModal mode={modalMode} onClose={handleNicknameClose} />
      )}

      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-4 animate-fade-in">
        <div>
          <h1 className="text-4xl font-black text-white">🧠 BrainGame</h1>
          <p className="text-[#64748b] text-sm mt-1">脳トレゲームで思考力を鍛えよう</p>
        </div>
        {nickname && (
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm bg-[#1a1a2e] border border-[#2a2a4a] px-3 py-1 rounded-full">
              {nickname}{age !== null ? ` (${age}歳)` : ""}
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
      </div>

      {/* ナビゲーションボタン */}
      <div className="flex gap-2 mb-6 animate-fade-in">
        <Link
          href="/stats"
          className="flex-1 flex items-center justify-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-bold px-3 py-2 rounded-xl transition-all whitespace-nowrap"
        >
          🧠 統計
        </Link>
        <Link
          href="/rankings"
          className="flex-1 flex items-center justify-center gap-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-bold px-3 py-2 rounded-xl transition-all whitespace-nowrap"
        >
          🏆 ランキング
        </Link>
        <Link
          href="/friends"
          className="relative flex-1 flex items-center justify-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-bold px-3 py-2 rounded-xl transition-all whitespace-nowrap"
        >
          👥 フレンド
          {pendingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </Link>
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
            <div className="flex flex-col gap-1">
              {age !== null && (() => {
                const { ageGroup, average } = getBenchmark(game.id, age);
                return (
                  <div className="flex items-center gap-1">
                    <span className="text-[#64748b] text-xs">📊 {ageGroup}平均</span>
                    <span className="text-[#94a3b8] font-bold text-sm">{average}{game.unit}</span>
                  </div>
                );
              })()}
              {bests[game.id] !== undefined ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400 text-xs">🏆 ベスト</span>
                    <span className="text-[#6c63ff] font-bold text-sm">
                      {bests[game.id]}{game.unit}
                    </span>
                    {game.lowerIsBetter && <span className="text-[#64748b] text-xs">(低いほど良い)</span>}
                  </div>
                  {(() => {
                    const pts = calcGamePoints(game.id, bests[game.id]!)
                    return (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        pts >= 15 ? "bg-green-500/15 text-green-400" :
                        pts >= 8  ? "bg-[#6c63ff]/15 text-[#6c63ff]" :
                                    "bg-orange-500/15 text-orange-400"
                      }`}>
                        {pts}点
                      </span>
                    )
                  })()}
                </div>
              ) : (
                <span className="text-[#64748b] text-xs">まだプレイ履歴なし</span>
              )}
              {(() => {
                const remaining = remainingPlays[game.id] ?? MAX_PLAYS_PER_DAY
                return (
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`text-xs font-bold ${
                      remaining === 0 ? "text-red-400" :
                      remaining === 1 ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {remaining === 0 ? "本日上限" : `残り${remaining}回`}
                    </span>
                  </div>
                )
              })()}
            </div>
          </Link>
        ))}
      </div>

      <p className="text-center text-[#2a2a4a] text-xs mt-10">
        {syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"}
      </p>
      <p className="text-center mt-2">
        <Link href="/privacy-policy" className="text-[#2a2a4a] text-xs hover:text-[#64748b] transition-colors">
          プライバシーポリシー
        </Link>
      </p>
    </main>
  );
}
