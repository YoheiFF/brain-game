"use client"
import type { CognitiveSkill } from "@/lib/brain-type"

interface Props {
  data: Record<CognitiveSkill, number | null>
  size?: number
}

const SKILLS: CognitiveSkill[] = ["計算力", "記憶力", "集中力", "反応速度", "空間認識"]

export default function RadarChart({ data, size = 220 }: Props) {
  const pad = 36
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const n = SKILLS.length

  function polar(angle: number, radius: number) {
    return {
      x: cx + radius * Math.sin(angle),
      y: cy - radius * Math.cos(angle),
    }
  }

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0]

  function gridPoints(ratio: number) {
    return SKILLS.map((_, i) => {
      const angle = (2 * Math.PI * i) / n
      const p = polar(angle, r * ratio)
      return `${p.x},${p.y}`
    }).join(" ")
  }

  function dataPoints() {
    return SKILLS.map((skill, i) => {
      const value = data[skill]
      const ratio = value !== null ? value / 100 : 0
      const angle = (2 * Math.PI * i) / n
      const p = polar(angle, r * ratio)
      return `${p.x},${p.y}`
    }).join(" ")
  }

  return (
    <svg width={size} height={size} viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}>
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={gridPoints(level)}
          fill="none"
          stroke="#2a2a4a"
          strokeWidth="1"
        />
      ))}
      {SKILLS.map((_, i) => {
        const angle = (2 * Math.PI * i) / n
        const end = polar(angle, r)
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={end.x} y2={end.y}
            stroke="#2a2a4a"
            strokeWidth="1"
          />
        )
      })}
      <polygon
        points={dataPoints()}
        fill="#6c63ff"
        fillOpacity="0.35"
        stroke="#6c63ff"
        strokeWidth="2"
      />
      {SKILLS.map((skill, i) => {
        const angle = (2 * Math.PI * i) / n
        const labelR = r + 22
        const p = polar(angle, labelR)
        const value = data[skill]
        return (
          <g key={skill}>
            <text
              x={p.x} y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fill={value !== null ? "#94a3b8" : "#3a3a5a"}
            >
              {skill}
            </text>
            {value !== null && (
              <text
                x={p.x} y={p.y + 13}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="#6c63ff"
                fontWeight="bold"
              >
                {value}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
