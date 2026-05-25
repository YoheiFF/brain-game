import type { GameId } from "./scores";

export type AgeGroup = "10代" | "20代" | "30代" | "40代" | "50代" | "60代以上";

export function getAgeGroup(age: number): AgeGroup {
  if (age < 20) return "10代";
  if (age < 30) return "20代";
  if (age < 40) return "30代";
  if (age < 50) return "40代";
  if (age < 60) return "50代";
  return "60代以上";
}

// 各ゲームの年代別平均スコア目安
const BENCHMARKS: Record<GameId, Record<AgeGroup, number>> = {
  calculation: {
    "10代":   14,
    "20代":   17,
    "30代":   16,
    "40代":   14,
    "50代":   12,
    "60代以上": 9,
  },
  "memory-number": {
    "10代":   7,
    "20代":   8,
    "30代":   7,
    "40代":   6,
    "50代":   6,
    "60代以上": 5,
  },
  stroop: {
    "10代":   18,
    "20代":   23,
    "30代":   21,
    "40代":   18,
    "50代":   15,
    "60代以上": 12,
  },
  reaction: {
    "10代":   14,
    "20代":   18,
    "30代":   16,
    "40代":   13,
    "50代":   10,
    "60代以上": 5,
  },
  pattern: {
    "10代":   10,
    "20代":   12,
    "30代":   11,
    "40代":   9,
    "50代":   8,
    "60代以上": 6,
  },
  "n-back": {
    "10代":   14,
    "20代":   14,
    "30代":   12,
    "40代":   10,
    "50代":   8,
    "60代以上": 6,
  },
  "dual-task": {
    "10代":   16,
    "20代":   15,
    "30代":   14,
    "40代":   12,
    "50代":   10,
    "60代以上": 8,
  },
  "trail-making": {
    "10代":   18,
    "20代":   20,
    "30代":   24,
    "40代":   30,
    "50代":   38,
    "60代以上": 48,
  },
  "mental-rotation": {
    "10代":   15,
    "20代":   16,
    "30代":   15,
    "40代":   13,
    "50代":   11,
    "60代以上": 9,
  },
  "running-total": {
    "10代":    6,
    "20代":    6,
    "30代":    5,
    "40代":    5,
    "50代":    4,
    "60代以上": 3,
  },
};

export function getBenchmark(gameId: GameId, age: number): { ageGroup: AgeGroup; average: number } {
  const ageGroup = getAgeGroup(age);
  return { ageGroup, average: BENCHMARKS[gameId][ageGroup] };
}
