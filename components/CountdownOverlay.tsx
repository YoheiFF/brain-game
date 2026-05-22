"use client"

interface Props {
  count: number | null
}

export default function CountdownOverlay({ count }: Props) {
  if (count === null) return null
  return (
    <div className="card p-8 flex flex-col items-center justify-center gap-4" style={{ minHeight: 280 }}>
      <span key={count} className="text-9xl font-black text-white animate-countdown-pop">
        {count}
      </span>
      <span className="text-[#64748b] text-sm">準備して...</span>
    </div>
  )
}
