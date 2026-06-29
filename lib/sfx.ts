// 効果音（正解 / 不正解）ユーティリティ
// BGM のミュート設定（localStorage "bgm_muted"）を尊重して再生する。
"use client";

const SOUNDS = {
  correct: "/sfx/correct.mp3",
  incorrect: "/sfx/incorrect.mp3",
} as const;

type SfxName = keyof typeof SOUNDS;

// 同じ Audio 要素を使い回す（連続再生は currentTime リセットで対応）
const cache: Partial<Record<SfxName, HTMLAudioElement>> = {};

function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("bgm_muted") === "true";
}

export function playSfx(name: SfxName): void {
  if (typeof window === "undefined") return;
  if (isMuted()) return;
  try {
    let audio = cache[name];
    if (!audio) {
      audio = new Audio(SOUNDS[name]);
      audio.volume = 0.6;
      cache[name] = audio;
    }
    audio.currentTime = 0;
    const p = audio.play();
    if (p) p.catch(() => {});
  } catch {
    // 再生不可の環境は無視
  }
}

export const playCorrect = () => playSfx("correct");
export const playIncorrect = () => playSfx("incorrect");
