"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GAME_IDS, GAME_META, GameId,
  type RankEntry, type OverallEntry,
} from "@/lib/scores";
import { calcGamePoints } from "@/lib/game-points";
import { getNickname } from "@/lib/nickname";
import { useDbSync } from "@/hooks/useDbSync";

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
  const [myGameEntries, setMyGameEntries] = useState<Partial<Record<GameId, RankEntry>>>({});
  const [myOverallEntry, setMyOverallEntry] = useState<OverallEntry | null>(null);

  // 画面を開いたときに1回だけ取得（ポーリングなし）
  const { data: syncData, loading } = useDbSync({ interval: null });

  useEffect(() => {
    setMyNick(getNickname());
  }, []);

  // DB データで描画（初回もDB取得後のみ表示）
  useEffect(() => {
    if (!syncData) return;
    setGameRankings(syncData.gameRankings);
    setOverall(syncData.overallRanking);
    setMyGameEntries(syncData.myGameRanks);
    setMyOverallEntry(syncData.myOverallRank);
  }, [syncData]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overall", label: "🏆 総合" },
    ...GAME_IDS.map((id) => ({ id: id as Tab, label: GAME_META[id].label })),
  ];

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-[#6c63ff] hover:underline">← ホーム</Link>
        <h1 className="text-3xl font-black text-white">ランキング</h1>
        {loading && (
          <span className="text-xs text-[#64748b] animate-pulse">同期中...</span>
        )}
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

      {/* ローディング中はスケルトン表示 */}
      {loading && !syncData && <RankingSkeleton />}

      {/* 総合ランキング */}
      {!loading && syncData && tab === "overall" && (
        <div className="animate-fade-in">
          <p className="text-[#64748b] text-xs mb-4">
            各ゲームポイント（20点満点）の合計順
          </p>
          {myOverallEntry && (
            <div className="mb-4">
              <p className="text-xs text-[#64748b] mb-2">あなたの順位</p>
              <OverallCard e={myOverallEntry} myNick={myNick} isMe />
              <div className="border-t border-[#2a2a4a] mt-4 mb-3" />
            </div>
          )}
          {overall.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {overall.map((e) => (
                <OverallCard key={e.nickname} e={e} myNick={myNick} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 種目別ランキング */}
      {!loading && syncData && tab !== "overall" && (
        <div className="animate-fade-in">
          {(() => {
            const gameId = tab as GameId;
            const { unit, lowerIsBetter } = GAME_META[gameId];
            const list = gameRankings[gameId] ?? [];
            return (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[#64748b] text-xs">
                    {lowerIsBetter ? "低いスコアほど上位" : "高いスコアほど上位"}
                  </p>
                </div>

                {myGameEntries[gameId] && (
                  <div className="mb-4">
                    <p className="text-xs text-[#64748b] mb-2">あなたの順位</p>
                    <GameCard e={myGameEntries[gameId]!} myNick={myNick} unit={unit} gameId={gameId} isMe />
                    <div className="border-t border-[#2a2a4a] mt-4 mb-3" />
                  </div>
                )}

                {list.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-3">
                    {list.map((e) => (
                      <GameCard key={`${e.nickname}-${e.rank}`} e={e} myNick={myNick} unit={unit} gameId={gameId} />
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

function GameCard({
  e, myNick, unit, gameId, isMe = false,
}: {
  e: RankEntry; myNick: string | null; unit: string; gameId: GameId; isMe?: boolean;
}) {
  return (
    <div className={`card p-4 flex items-center gap-4 transition-all ${
      isMe || e.nickname === myNick ? "border-[#6c63ff] bg-[#6c63ff]/5" : ""
    }`}>
      <span className={`text-2xl w-10 text-center font-black ${e.rank <= 3 ? "" : "text-[#64748b]"}`}>
        {medal(e.rank)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white truncate">{e.nickname}</span>
          {(isMe || e.nickname === myNick) && (
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
        <p className="text-[#6c63ff] text-sm font-bold">
          {calcGamePoints(gameId, e.score)}
          <span className="text-xs text-[#64748b] ml-0.5">pt</span>
        </p>
      </div>
    </div>
  );
}

function OverallCard({
  e, myNick, isMe = false,
}: {
  e: OverallEntry; myNick: string | null; isMe?: boolean;
}) {
  return (
    <div className={`card p-4 flex items-center gap-4 transition-all ${
      isMe || e.nickname === myNick ? "border-[#6c63ff] bg-[#6c63ff]/5" : ""
    }`}>
      <span className={`text-2xl w-10 text-center font-black ${e.rank <= 3 ? "" : "text-[#64748b]"}`}>
        {medal(e.rank)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white truncate">{e.nickname}</span>
          {(isMe || e.nickname === myNick) && (
            <span className="text-xs bg-[#6c63ff]/20 text-[#6c63ff] px-2 py-0.5 rounded-full">あなた</span>
          )}
        </div>
        <div className="flex gap-3 mt-1 flex-wrap">
          {GAME_IDS.map((gid) =>
            e.details[gid] !== undefined ? (
              <span key={gid} className="text-xs text-[#64748b]">
                {GAME_META[gid].label}:{" "}
                <span className="text-white">{calcGamePoints(gid, e.details[gid]!)}pt</span>
                <span className="text-[#64748b]">({e.details[gid]}{GAME_META[gid].unit})</span>
              </span>
            ) : null
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xl font-black text-[#6c63ff]">{e.totalPoints}</p>
        <p className="text-[#64748b] text-xs">pt（{e.gamesPlayed}種目）</p>
      </div>
    </div>
  );
}

function RankingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-4">
          <div className="w-10 h-8 bg-[#2a2a4a] rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[#2a2a4a] rounded w-24" />
            <div className="h-3 bg-[#2a2a4a] rounded w-40" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-6 bg-[#2a2a4a] rounded w-12" />
            <div className="h-3 bg-[#2a2a4a] rounded w-8 ml-auto" />
          </div>
        </div>
      ))}
    </div>
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
