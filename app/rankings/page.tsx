"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GAME_IDS, GAME_META, GameId,
  getGameRanking, getOverallRanking,
  type RankEntry, type OverallEntry,
} from "@/lib/scores";
import { getNickname } from "@/lib/nickname";

type Tab = GameId | "overall";

const MEDAL = ["🥇", "🥈", "🥉"];

function medal(rank: number) {
  return rank <= 3 ? MEDAL[rank - 1] : `${rank}位`;
}

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>("overall");
  const [gameRankings, setGameRankings] = useState<Partial<Record<GameId, RankEntry[]>>>({});
  const [overall, setOverall] = useState<OverallEntry[]>([]);
  const [myNick, setMyNick] = useState<string | null>(null);

  useEffect(() => {
    setMyNick(getNickname());
    const gr: Partial<Record<GameId, RankEntry[]>> = {};
    for (const id of GAME_IDS) gr[id] = getGameRanking(id);
    setGameRankings(gr);
    setOverall(getOverallRanking());
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overall", label: "🏆 総合" },
    ...GAME_IDS.map((id) => ({ id: id as Tab, label: GAME_META[id].label })),
  ];

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-[#6c63ff] hover:underline">← ホーム</Link>
        <h1 className="text-3xl font-black text-white">ランキング</h1>
      </div>

      {/* タブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
              tab === t.id
                ? "bg-[#6c63ff] text-white"
                : "bg-[#1a1a2e] border border-[#2a2a4a] text-[#64748b] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 総合ランキング */}
      {tab === "overall" && (
        <div className="animate-fade-in">
          <p className="text-[#64748b] text-xs mb-4">
            各種目のスコアを20代平均基準で換算した合計点順（最大100点）
          </p>
          {overall.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {overall.map((e) => (
                <div
                  key={e.nickname}
                  className={`card p-4 flex items-center gap-4 transition-all ${
                    e.nickname === myNick ? "border-[#6c63ff] bg-[#6c63ff]/5" : ""
                  }`}
                >
                  <span className={`text-2xl w-10 text-center font-black ${e.rank <= 3 ? "" : "text-[#64748b]"}`}>
                    {medal(e.rank)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{e.nickname}</span>
                      {e.nickname === myNick && (
                        <span className="text-xs bg-[#6c63ff]/20 text-[#6c63ff] px-2 py-0.5 rounded-full">あなた</span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {GAME_IDS.map((gid) =>
                        e.details[gid] !== undefined ? (
                          <span key={gid} className="text-xs text-[#64748b]">
                            {GAME_META[gid].label.replace("テスト", "").replace("ゲーム", "")}:{" "}
                            <span className="text-white">{e.details[gid]}{GAME_META[gid].unit}</span>
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#6c63ff]">{e.totalPoints}</p>
                    <p className="text-[#64748b] text-xs">/ 100点</p>
                    <p className="text-[#64748b] text-xs mt-0.5">{e.gamesPlayed}/5種目</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 種目別ランキング */}
      {tab !== "overall" && (
        <div className="animate-fade-in">
          {(() => {
            const gameId = tab as GameId;
            const { label, unit, lowerIsBetter } = GAME_META[gameId];
            const list = gameRankings[gameId] ?? [];
            return (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[#64748b] text-xs">
                    {lowerIsBetter ? "低いスコアほど上位" : "高いスコアほど上位"}
                  </p>
                </div>
                {list.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-3">
                    {list.map((e) => (
                      <div
                        key={`${e.nickname}-${e.rank}`}
                        className={`card p-4 flex items-center gap-4 transition-all ${
                          e.nickname === myNick ? "border-[#6c63ff] bg-[#6c63ff]/5" : ""
                        }`}
                      >
                        <span className={`text-2xl w-10 text-center font-black ${e.rank <= 3 ? "" : "text-[#64748b]"}`}>
                          {medal(e.rank)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white truncate">{e.nickname}</span>
                            {e.nickname === myNick && (
                              <span className="text-xs bg-[#6c63ff]/20 text-[#6c63ff] px-2 py-0.5 rounded-full">あなた</span>
                            )}
                          </div>
                          <p className="text-[#64748b] text-xs mt-0.5">
                            {new Date(e.date).toLocaleDateString("ja-JP")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-white">
                            {e.score}
                            <span className="text-sm text-[#64748b] ml-1">{unit}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 flex flex-col items-center gap-3 text-center">
      <p className="text-4xl">📊</p>
      <p className="text-white font-bold">まだデータがありません</p>
      <p className="text-[#64748b] text-sm">ゲームをプレイするとランキングに表示されます</p>
      <Link href="/" className="btn-primary mt-2">ゲームをプレイ</Link>
    </div>
  );
}
