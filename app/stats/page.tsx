"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getAllPersonalBests, getTotalPlayCount, type GameId } from "@/lib/scores"
import { getAge } from "@/lib/nickname"
import { calcBrainAge } from "@/lib/brain-age"
import { getRadarData, getBrainType, type CognitiveSkill } from "@/lib/brain-type"
import { getAllTitles } from "@/lib/titles"
import { getDailyHistory, getDailyBests } from "@/lib/daily"
import RadarChart from "@/components/RadarChart"
import MiniBarChart from "@/components/MiniBarChart"
import { useDbSync } from "@/hooks/useDbSync"

type Tab = "today" | "alltime"

const RARITY_COLOR = {
  normal: "border-[#2a2a4a] text-[#64748b]",
  rare: "border-blue-500/40 text-blue-400",
  epic: "border-purple-500/40 text-purple-400",
}

export default function StatsPage() {
  const [bests, setBests] = useState<Partial<Record<GameId, number>>>({})
  const [dailyBests, setDailyBests] = useState<Partial<Record<GameId, number>>>({})
  const [age, setAge] = useState<number | null>(null)
  const [totalPlays, setTotalPlays] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>("today")

  // 初回マウント時のみ DB から最新データを取得して localStorage を更新（BUG-3 補完）
  const { data: syncData } = useDbSync({ interval: null })

  // 初回マウント時に localStorage から読み込む（既存）
  useEffect(() => {
    setMounted(true)
    setBests(getAllPersonalBests())
    setDailyBests(getDailyBests())
    setAge(getAge())
    setTotalPlays(getTotalPlayCount())
  }, [])

  // DB 同期完了後に画面を再描画（追加）
  useEffect(() => {
    if (!syncData) return
    // useDbSync が localStorage を更新済みのため、再読み込みで最新値を取得する
    setBests(getAllPersonalBests())
    setDailyBests(getDailyBests())
    setTotalPlays(getTotalPlayCount())
  }, [syncData])

  if (!mounted) return null

  const currentBests = tab === "today" ? dailyBests : bests
  const brainAge = calcBrainAge(currentBests)
  const radarData = getRadarData(currentBests)
  const brainType = getBrainType(radarData)
  const titles = getAllTitles(bests, totalPlays)
  const history = getDailyHistory(14)
  const hasData = Object.keys(bests).length > 0
  const hasTodayData = Object.keys(dailyBests).length > 0

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-[#6c63ff] hover:underline">← ホーム</Link>
        <h1 className="text-3xl font-black text-white">🧠 脳の統計</h1>
      </div>

      {!hasData ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-4">🎮</p>
          <p className="text-white font-bold mb-2">まだプレイ履歴がありません</p>
          <p className="text-[#64748b] text-sm mb-6">ゲームをプレイすると統計が表示されます</p>
          <Link href="/" className="btn-primary">ゲームをプレイ</Link>
        </div>
      ) : (
        <div className="space-y-6">

          {/* タブ切り替え */}
          <div className="flex rounded-xl bg-[#1a1a2e] border border-[#2a2a4a] p-1 gap-1">
            <button
              onClick={() => setTab("today")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                tab === "today"
                  ? "bg-[#6c63ff] text-white shadow-lg"
                  : "text-[#64748b] hover:text-white"
              }`}
            >
              今日
            </button>
            <button
              onClick={() => setTab("alltime")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                tab === "alltime"
                  ? "bg-[#6c63ff] text-white shadow-lg"
                  : "text-[#64748b] hover:text-white"
              }`}
            >
              累計ベスト
            </button>
          </div>

          {/* 脳年齢 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-4">🧬 脳年齢診断</h2>
            {tab === "today" && !hasTodayData ? (
              <p className="text-[#64748b] text-sm">今日はまだプレイしていません</p>
            ) : brainAge !== null ? (
              <div className="flex items-end gap-3">
                <span className="text-6xl font-black text-[#6c63ff]">{brainAge}</span>
                <span className="text-[#64748b] text-lg mb-1">歳</span>
                {age !== null && (
                  <span className={`text-sm mb-1 font-bold ${
                    brainAge < age ? "text-green-400" :
                    brainAge > age + 5 ? "text-red-400" : "text-yellow-400"
                  }`}>
                    {brainAge < age
                      ? `実年齢より${age - brainAge}歳若い！`
                      : brainAge > age
                      ? `実年齢より${brainAge - age}歳上`
                      : "実年齢と同等"}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[#64748b] text-sm">2種目以上プレイすると診断できます</p>
            )}
            <p className="text-[#3a3a6a] text-xs mt-2">※5種目のスコアをもとにした推定値です</p>
          </section>

          {/* レーダーチャート + 脳タイプ */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-1">📊 認知能力マップ</h2>
            {tab === "today" && !hasTodayData ? (
              <p className="text-[#64748b] text-sm">今日はまだプレイしていません</p>
            ) : (
              <>
                <p className="text-[#6c63ff] font-bold text-sm mb-4">タイプ: {brainType}</p>
                <div className="flex justify-center">
                  <RadarChart data={radarData as Record<CognitiveSkill, number | null>} size={240} />
                </div>
                <p className="text-[#3a3a6a] text-xs mt-2 text-center">
                  ※ 20代平均スコアを50として換算
                </p>
              </>
            )}
          </section>

          {/* 称号 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-1">🏅 称号コレクション</h2>
            <p className="text-[#64748b] text-xs mb-4">累計プレイ: {totalPlays}回</p>
            <div className="grid grid-cols-2 gap-3">
              {titles.map((title) => (
                <div
                  key={title.id}
                  className={`border rounded-xl p-3 transition-all ${
                    title.earned
                      ? RARITY_COLOR[title.rarity]
                      : "border-[#1a1a2e] opacity-30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{title.icon}</span>
                    <span className={`text-sm font-bold ${title.earned ? "text-white" : "text-[#64748b]"}`}>
                      {title.name}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748b]">{title.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 成長グラフ */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-1">📈 成長グラフ（直近14日）</h2>
            <p className="text-[#64748b] text-xs mb-4">
              1日の合計ポイント推移（今日の分は紫）
            </p>
            <MiniBarChart data={history} height={80} />
          </section>

        </div>
      )}
    </main>
  )
}
