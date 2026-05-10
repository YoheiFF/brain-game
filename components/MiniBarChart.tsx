"use client"
import type { DailyHistoryEntry } from "@/lib/daily"

interface Props {
  data: DailyHistoryEntry[]
  height?: number
}

export default function MiniBarChart({ data, height = 80 }: Props) {
  const max = Math.max(...data.map((d) => d.totalPoints), 1)
  const barWidth = 14
  const gap = 4
  const width = data.length * (barWidth + gap)

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height + 20}`} preserveAspectRatio="none">
      {data.map((entry, i) => {
        const barH = Math.max(2, (entry.totalPoints / max) * height)
        const x = i * (barWidth + gap)
        const y = height - barH
        const isToday = i === data.length - 1

        return (
          <g key={entry.date}>
            <rect
              x={x} y={y}
              width={barWidth}
              height={barH}
              rx="3"
              fill={isToday ? "#6c63ff" : entry.totalPoints > 0 ? "#3a3a7a" : "#1a1a3a"}
            />
            {(i === 0 || i === data.length - 1 || i % 7 === 0) && (
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#3a3a5a"
              >
                {entry.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
