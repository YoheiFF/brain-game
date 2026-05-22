"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getAllPersonalBests, getTotalPlayCount, type GameId } from "@/lib/scores"
import { getAge } from "@/lib/nickname"
import { calcBrainAge } from "@/lib/brain-age"
import { getRadarData, getBrainType, SKILL_GAMES, type CognitiveSkill } from "@/lib/brain-type"
import { getAllTitles } from "@/lib/titles"
import RadarChart from "@/components/RadarChart"
import { useDbSync } from "@/hooks/useDbSync"

const RARITY_COLOR = {
  normal: "border-[#2a2a4a] text-[#64748b]",
  rare: "border-blue-500/40 text-blue-400",
  epic: "border-purple-500/40 text-purple-400",
}

export default function StatsPage() {
  const [bests, setBests] = useState<Partial<Record<GameId, number>>>({})
  const [age, setAge] = useState<number | null>(null)
  const [totalPlays, setTotalPlays] = useState(0)
  const [mounted, setMounted] = useState(false)

  // 初回マウント時のみ DB から最新データを取得して localStorage を更新（BUG-3 補完）
  const { data: syncData } = useDbSync({ interval: null })

  // 初回マウント時に localStorage から読み込む（既存）
  useEffect(() => {
    setMounted(true)
    setBests(getAllPersonalBests())
    setAge(getAge())
    setTotalPlays(getTotalPlayCount())
  }, [])

  // DB 同期完了後に画面を再描画（追加）
  useEffect(() => {
    if (!syncData) return
    // useDbSync が localStorage を更新済みのため、再読み込みで最新値を取得する
    setBests(getAllPersonalBests())
    setTotalPlays(getTotalPlayCount())
  }, [syncData])

  if (!mounted) return null

  const brainAge = calcBrainAge(bests)
  const radarData = getRadarData(bests)
  const brainType = getBrainType(radarData)
  const titles = getAllTitles(bests, totalPlays)
  const hasData = Object.keys(bests).length > 0

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

          {/* 脳年齢 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-4">🧬 脳年齢診断</h2>
            {brainAge !== null ? (
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
            <p className="text-[#6c63ff] font-bold text-sm mb-4">タイプ: {brainType}</p>
            <div className="flex justify-center">
              <RadarChart data={radarData as Record<CognitiveSkill, number | null>} size={240} />
            </div>
            <p className="text-[#3a3a6a] text-xs mt-2 text-center">
              ※ ゲームポイント20点満点を100として換算
            </p>
            {(() => {
              const entries = Object.entries(radarData) as [CognitiveSkill, number | null][]
              const unplayed = entries.filter(([, v]) => v === null)
              const played = entries.filter(([, v]) => v !== null) as [CognitiveSkill, number][]
              const target: CognitiveSkill | null =
                unplayed.length > 0
                  ? unplayed[0][0]
                  : played.length > 0
                  ? [...played].sort((a, b) => a[1] - b[1])[0][0]
                  : null
              if (!target) return null
              const games = SKILL_GAMES[target]
              const isUnplayed = unplayed.some(([s]) => s === target)
              return (
                <div className="mt-4 p-3 bg-[#0f0f1e] rounded-xl border border-[#2a2a4a]">
                  <p className="text-xs text-[#64748b] mb-1">
                    💡 {isUnplayed ? "まだ計測していない認知能力があります" : "最も伸びしろのある認知能力"}
                  </p>
                  <p className="text-sm text-white">
                    <span className="text-[#6c63ff] font-bold">{target}</span>を鍛えよう！
                  </p>
                  <p className="text-xs text-[#64748b] mt-1">
                    おすすめ：{games.map((g) => g.title).join(" / ")}
                  </p>
                </div>
              )
            })()}
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


        </div>
      )}
    </main>
  )
}
