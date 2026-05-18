"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface BGMContextType {
  pause: () => void;
  resume: () => void;
  muted: boolean;
  toggleMute: () => void;
}

const BGMContext = createContext<BGMContextType>({
  pause: () => {},
  resume: () => {},
  muted: false,
  toggleMute: () => {},
});

export function useBGM() {
  return useContext(BGMContext);
}

export default function BGMProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gamePausedRef = useRef(false);
  // Ref で同期的にミュート状態を管理（play/pause の判断に使う）
  const mutedRef = useRef(false);
  // 進行中の play() Promise を追跡（Androidで pause() が無視されるのを防ぐ）
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bgm_muted") === "true";
  });
  // state と ref を常に同期
  mutedRef.current = muted;

  // play() を安全に呼ぶ（Promise を記録）
  const safePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const p = audio.play();
    if (p) {
      playPromiseRef.current = p;
      p.then(() => { playPromiseRef.current = null; })
       .catch(() => { playPromiseRef.current = null; });
    }
  }, []);

  // pause() を安全に呼ぶ（進行中の play() Promise 解決後にポーズ）
  const safePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playPromiseRef.current) {
      playPromiseRef.current
        .then(() => audio.pause())
        .catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  useEffect(() => {
    const audio = new Audio("/music/gameplay_town_theme.mp3");
    audio.loop = true;
    audio.volume = 0.4;
    audioRef.current = audio;

    if (!mutedRef.current) {
      const p = audio.play();
      if (p) {
        playPromiseRef.current = p;
        p.then(() => { playPromiseRef.current = null; })
         .catch(() => {
           playPromiseRef.current = null;
           // オートプレイがブロックされた場合は最初のユーザー操作で再生
           const start = () => {
             if (!mutedRef.current) safePlay();
             document.removeEventListener("click", start, true);
             document.removeEventListener("touchstart", start, true);
           };
           document.addEventListener("click", start, true);
           document.addEventListener("touchstart", start, true);
         });
      }
    }

    return () => {
      audio.pause();
      audio.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mutedRef を使うので muted state に依存しない → 安定したコールバック
  const pause = useCallback(() => {
    gamePausedRef.current = true;
    safePause();
  }, [safePause]);

  const resume = useCallback(() => {
    gamePausedRef.current = false;
    if (!mutedRef.current) safePlay();
  }, [safePlay]);

  const toggleMute = useCallback(() => {
    const newMuted = !mutedRef.current;
    // ref を即時更新（非同期の setState より先に判断に使われる）
    mutedRef.current = newMuted;
    setMuted(newMuted);
    localStorage.setItem("bgm_muted", String(newMuted));
    if (newMuted) {
      safePause();
    } else if (!gamePausedRef.current) {
      safePlay();
    }
  }, [safePause, safePlay]);

  return (
    <BGMContext.Provider value={{ pause, resume, muted, toggleMute }}>
      {children}
      <button
        onClick={toggleMute}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-[#1a1a2e] border border-[#2a2a4a] flex items-center justify-center text-lg shadow-lg hover:border-[#6c63ff] transition-all"
        title={muted ? "ミュート解除" : "ミュート"}
        aria-label={muted ? "ミュート解除" : "ミュート"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </BGMContext.Provider>
  );
}
