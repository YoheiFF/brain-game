"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAllPersonalBests, migrateReactionScore, type GameId, GAME_IDS } from "@/lib/scores";
import { calcGamePoints } from "@/lib/game-points";
import { getNickname, hasNickname, getAge, getUserId } from "@/lib/nickname";
import NicknameModal from "@/components/NicknameModal";
import { getBenchmark } from "@/lib/benchmarks";
import { getAllRemainingPlays, MAX_PLAYS_PER_DAY, getFreePoints, addFreePoint, addFreePoints } from "@/lib/daily";
import { showRewardedAd } from "@/lib/admob";
import { useDbSync } from "@/hooks/useDbSync";

const APP_URL = "https://brain-game-opal.vercel.app";

const GAMES: {
  id: GameId;
  title: string;
  description: string;
  icon: string;
  color: string;
  unit: string;
  benchmarkUnit?: string;
  lowerIsBetter?: boolean;
}[] = [
  { id: "calculation",    title: "計算ゲーム",     description: "30秒間で四則演算を解け！",       icon: "🧮", color: "from-violet-600 to-purple-700", unit: "問" },
  { id: "memory-number",  title: "数字記憶",       description: "数列を覚えて正確に入力しよう",   icon: "🔢", color: "from-blue-600 to-cyan-600",     unit: "桁" },
  { id: "stroop",         title: "ストループ", description: "文字の色に惑わされるな！",       icon: "🎨", color: "from-pink-600 to-rose-600",     unit: "個" },
  { id: "reaction",       title: "反応速度テスト",  description: "光ったらすぐにタップ！",         icon: "⚡", color: "from-yellow-500 to-orange-600",  unit: "点", benchmarkUnit: "ms" },
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
  const [freePoints, setFreePoints] = useState(0);
  const [adLoading, setAdLoading] = useState(false);
  const [adFailed, setAdFailed] = useState(false);

  const handleReferralShare = () => {
    const uid = getUserId();
    if (!uid) return;
    const shareUrl = `${APP_URL}/?ref=${uid}`;
    const shareText = `🧠 BrainGameで脳トレしよう！\n友達招待で私に+10pt！\n${shareUrl}`;
    const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;
    window.open(lineUrl, "_blank", "noopener,noreferrer");
  };

  const handleWatchAd = async () => {
    setAdLoading(true);
    setAdFailed(false);
    const rewarded = await showRewardedAd();
    if (rewarded) {
      addFreePoint();
      setFreePoints(getFreePoints());
    } else {
      setAdFailed(true);
    }
    setAdLoading(false);
  };
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [modalMode, setModalMode] = useState<"setup" | "change">("setup");
  const [mounted, setMounted] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ホームはポーリングなし（初回フェッチのみ）
  const { data: syncData, loading: syncLoading } = useDbSync({ interval: null });

  useEffect(() => {
    setMounted(true);

    // ?ref= パラメータの処理（被紹介者フロー）
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get("ref");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (refParam && UUID_RE.test(refParam)) {
      sessionStorage.setItem("braingame_ref", refParam);
      // URLからrefパラメータを除去（リロード時の再処理防止）
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, "", cleanUrl);
    }

    migrateReactionScore();
    setBests(getAllPersonalBests());
    const nick = getNickname();
    setNickname(nick);
    setAge(getAge());
    setRemainingPlays(getAllRemainingPlays());
    setFreePoints(getFreePoints());
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
    const remaining: Partial<Record<GameId, number>> = {};
    for (const id of GAME_IDS) {
      const play = syncData.dailyPlays[id];
      remaining[id] = Math.max(0, MAX_PLAYS_PER_DAY - (play?.playCount ?? 0));
    }
    setRemainingPlays(remaining);
    // referralBonus があればlocalStorageに加算してDBをリセット
    if (syncData.referralBonus > 0) {
      addFreePoints(syncData.referralBonus);
      setFreePoints(getFreePoints());
      const uid = getUserId();
      if (uid) {
        fetch("/api/referral/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid }),
        }).catch(() => {});
      }
    }
  }, [syncData]);

  const handleNicknameClose = (nick: string) => {
    setNickname(nick);
    setAge(getAge());
    setShowNicknameModal(false);
    // 新規登録（setup）のみ紹介ポイント付与を試みる
    if (modalMode === "setup") {
      const ref = sessionStorage.getItem("braingame_ref");
      if (ref) {
        const myId = getUserId();
        if (myId) {
          fetch("/api/referral/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referrerId: ref, newUserId: myId }),
          }).catch(() => {});
        }
        sessionStorage.removeItem("braingame_ref");
      }
    }
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

      {/* フリーポイント表示 */}
      <div className="mb-4 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-xl animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-lg">🎫</span>
          <span className="text-blue-400 text-sm font-bold">フリーポイント</span>
          <span className="text-[#64748b] text-xs">（3回プレイ後に使用可）</span>
          <span className="ml-auto text-blue-400 font-black text-xl">{freePoints}<span className="text-sm font-bold ml-0.5">pt</span></span>
        </div>
        <button
          onClick={handleWatchAd}
          disabled={adLoading}
          className="mt-2 w-full text-sm font-bold py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 transition-all disabled:opacity-50"
        >
          {adLoading ? "広告読み込み中..." : "📺 広告を見てフリーポイント+1"}
        </button>
        {adFailed && (
          <p className="text-[#64748b] text-xs text-center mt-1">広告を読み込めませんでした。もう一度お試しください。</p>
        )}
        {nickname && (
          <button
            onClick={handleReferralShare}
            className="mt-2 w-full text-sm font-bold py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 transition-all"
          >
            📤 友達を招待して+10pt
          </button>
        )}
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
                    <span className="text-[#94a3b8] font-bold text-sm">{average}{game.benchmarkUnit ?? game.unit}</span>
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
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs font-bold ${
                      remaining === 0 ? "text-red-400" :
                      remaining === 1 ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {remaining === 0 ? "本日上限" : `残り${remaining}回`}
                    </span>
                    {remaining === 0 && freePoints > 0 && (
                      <span className="text-xs font-bold text-blue-400">
                        フリーポイント {freePoints}pt
                      </span>
                    )}
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
