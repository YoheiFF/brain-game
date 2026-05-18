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
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bgm_muted") === "true";
  });

  useEffect(() => {
    const audio = new Audio("/music/gameplay_town_theme.mp3");
    audio.loop = true;
    audio.volume = 0.4;
    audioRef.current = audio;

    if (!muted) {
      audio.play().catch(() => {
        const start = () => {
          if (!gamePausedRef.current && !audio.paused === false) {
            audio.play().catch(() => {});
          }
          document.removeEventListener("click", start, true);
          document.removeEventListener("touchstart", start, true);
        };
        document.addEventListener("click", start, true);
        document.addEventListener("touchstart", start, true);
      });
    }

    return () => {
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    gamePausedRef.current = true;
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    gamePausedRef.current = false;
    if (!muted && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem("bgm_muted", String(next));
      if (audioRef.current) {
        if (next) {
          audioRef.current.pause();
        } else if (!gamePausedRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
      return next;
    });
  }, []);

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
