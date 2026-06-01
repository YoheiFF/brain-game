// app/superbrain/page.tsx
"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type SuperBrainSession,
  loadSession,
  saveSession,
  clearSession,
  createSession,
  selectRandomGames,
  incrementSuperBrainClearCount,
} from "@/lib/superbrain-session";
import {
  getChallengeSequence,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
  PASS_THRESHOLD,
  type Difficulty,
} from "@/lib/difficulty";
import { GAME_IDS, GAME_META, type GameId } from "@/lib/scores";

type PageStatus = "waiting" | "preparing" | "launching" | "gameover" | "cleared";

interface PrepInfo {
  gameId: GameId;
  difficulty: Difficulty;
  challengeIndex: number;
  sessionId: string;
}

// ── 次ゲーム予告・準備画面 ──────────────────────────────────

function PreparingScreen({
  prepInfo,
  session,
  onGo,
  onHome,
}: {
  prepInfo: PrepInfo;
  session: SuperBrainSession;
  onGo: () => void;
  onHome: () => void;
}) {
  const [count, setCount] = useState(3);
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;
  const meta = GAME_META[prepInfo.gameId];
  const threshold = PASS_THRESHOLD[prepInfo.gameId]?.[prepInfo.difficulty];
  const lowerIsBetter = !!meta.lowerIsBetter;

  useEffect(() => {
    if (count <= 0) {
      onGoRef.current();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <div className="card p-8 flex flex-col items-center gap-4 animate-fade-in">
      <p className="text-[#64748b] text-sm">第{prepInfo.challengeIndex + 1}問 / 5</p>

      <span className={`text-sm font-bold px-3 py-1 rounded-full border ${DIFFICULTY_COLORS[prepInfo.difficulty]}`}>
        {DIFFICULTY_LABELS[prepInfo.difficulty]}
      </span>

      <h2 className="text-3xl font-black text-white text-center">{meta.label}</h2>

      {threshold !== undefined && (
        <p className="text-sm text-[#64748b]">
          クリア基準：<span className="text-orange-300 font-bold">{threshold}{meta.unit}{lowerIsBetter ? "以下" : "以上"}</span>
        </p>
      )}

      <div className={`text-8xl font-black mt-2 transition-all duration-300 ${
        count > 0 ? "text-orange-400" : "text-green-400 scale-110"
      }`}>
        {count > 0 ? count : "GO!"}
      </div>

      {session.results.length > 0 && (
        <p className="text-green-400 text-xs mt-1">{session.results.length}問クリア済み ✓</p>
      )}

      <button onClick={onHome} className="btn-secondary text-sm mt-2 w-full">キャンセルしてTOPへ戻る</button>
    </div>
  );
}

// ── ゲームオーバー画面 ────────────────────────────────────

function GameOverScreen({
  session,
  onRetry,
  onHome,
}: {
  session: SuperBrainSession;
  onRetry: () => void;
  onHome: () => void;
}) {
  const failedResult = session.results[session.results.length - 1];
  if (!failedResult) return null;

  return (
    <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
      <div className="text-6xl">💀</div>
      <h2 className="text-3xl font-black text-red-400">GAME OVER</h2>
      <div className="w-full bg-[#0f0f1a] border border-red-500/30 rounded-xl p-4 space-y-2">
        <p className="text-[#64748b] text-sm">
          第{session.results.length}問: <span className="text-white font-bold">{GAME_META[failedResult.gameId].label}</span>
        </p>
        <p className="text-[#64748b] text-sm">
          難易度: <span className="font-bold text-orange-400">{DIFFICULTY_LABELS[failedResult.difficulty]}</span>
        </p>
        <p className="text-[#64748b] text-sm">
          スコア: <span className="text-white font-bold">{failedResult.score}{GAME_META[failedResult.gameId].unit}</span>
          &nbsp;/&nbsp;
          クリア基準: <span className="text-green-400 font-bold">{failedResult.clearThreshold}{GAME_META[failedResult.gameId].unit}</span>
          {GAME_META[failedResult.gameId].lowerIsBetter
            ? <span className="text-[#64748b] text-xs ml-1">以下</span>
            : <span className="text-[#64748b] text-xs ml-1">以上</span>
          }
        </p>
      </div>
      {session.results.length > 1 && (
        <p className="text-[#64748b] text-sm">
          {session.results.length - 1}問クリア済み
        </p>
      )}
      <div className="flex gap-3 w-full">
        <button onClick={onHome} className="btn-secondary flex-1">ホームへ戻る</button>
        <button onClick={onRetry} className="btn-primary flex-1">もう一度挑戦</button>
      </div>
    </div>
  );
}

// ── クリア画面 ─────────────────────────────────────────

function ClearScreen({
  session,
  onRetry,
  onHome,
}: {
  session: SuperBrainSession;
  onRetry: () => void;
  onHome: () => void;
}) {
  return (
    <div className="card p-8 flex flex-col items-center gap-6 animate-scale-in">
      <div className="text-6xl animate-bounce-once">🏆</div>
      <h2 className="text-3xl font-black text-yellow-400">SuperBrain CLEAR!</h2>
      <p className="text-[#64748b] text-sm">全5問クリア達成！</p>
      <div className="w-full space-y-2">
        {session.results.map((r, i) => (
          <div key={i} className="flex items-center justify-between bg-[#0f0f1a] rounded-xl px-3 py-2 border border-green-500/20">
            <span className="text-[#64748b] text-xs">第{i + 1}問</span>
            <span className="text-white text-sm font-bold">{GAME_META[r.gameId].label}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[r.difficulty]}`}>
              {DIFFICULTY_LABELS[r.difficulty]}
            </span>
            <span className="text-green-400 text-sm font-bold">{r.score}{GAME_META[r.gameId].unit}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 w-full">
        <button onClick={onHome} className="btn-secondary flex-1">ホームへ戻る</button>
        <button onClick={onRetry} className="btn-primary flex-1">もう一度挑戦</button>
      </div>
    </div>
  );
}

// ── プログレスバー ─────────────────────────────────────

function ProgressBar({ results, totalSteps }: { results: SuperBrainSession["results"]; totalSteps: number }) {
  const sequence = getChallengeSequence();
  return (
    <div className="flex gap-2 w-full mb-4">
      {Array.from({ length: totalSteps }, (_, i) => {
        const result = results[i];
        const difficulty: Difficulty = sequence[i];
        let bg = "bg-[#2a2a4a]";
        if (result?.passed) bg = "bg-green-500";
        else if (result && !result.passed) bg = "bg-red-500";
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-2 w-full rounded-full ${bg}`} />
            <span className="text-[#64748b] text-xs">{DIFFICULTY_LABELS[difficulty]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 待機画面 ─────────────────────────────────────────

function WaitingScreen({ onStart, onHome }: { onStart: () => void; onHome: () => void }) {
  const sequence = getChallengeSequence();
  return (
    <div className="card p-8 flex flex-col items-center gap-6 animate-fade-in">
      <div className="text-6xl">🧠⚡</div>
      <h2 className="text-2xl font-black text-white">SuperBrain チャレンジ</h2>
      <div className="w-full space-y-2 text-sm text-[#64748b]">
        <p>全10ゲームから<span className="text-white font-bold">5種ランダム</span>で連続チャレンジ！</p>
        <p><span className="text-red-400 font-bold">1問でも失敗</span>でゲームオーバー</p>
        <p>全5問クリアで<span className="text-yellow-400 font-bold">SuperBrain 達成！</span></p>
      </div>
      <div className="w-full space-y-2">
        {sequence.map((diff, i) => (
          <div key={i} className="flex items-center justify-between bg-[#0f0f1a] rounded-xl px-3 py-2">
            <span className="text-[#64748b] text-sm">第{i + 1}問</span>
            <span className={`text-sm font-bold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[diff]}`}>
              {DIFFICULTY_LABELS[diff]}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 w-full">
        <button onClick={onHome} className="btn-secondary flex-1">TOPへ戻る</button>
        <button onClick={onStart} className="btn-primary flex-1 text-lg py-3">
          チャレンジ開始
        </button>
      </div>
    </div>
  );
}

// ── メインコンポーネント ────────────────────────────────

function SuperBrainPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageStatus, setPageStatus] = useState<PageStatus>("waiting");
  const [session, setSession] = useState<SuperBrainSession | null>(null);
  const [prepInfo, setPrepInfo] = useState<PrepInfo | null>(null);

  // ゲームから戻ってきた時の処理
  useEffect(() => {
    const resultParam = searchParams.get("result");
    const sessionParam = searchParams.get("session");
    if (!resultParam || !sessionParam) return;

    const stored = loadSession();
    if (!stored || stored.sessionId !== sessionParam) {
      clearSession();
      setPageStatus("waiting");
      window.history.replaceState(null, "", "/superbrain");
      return;
    }

    if (resultParam === "ng") {
      stored.status = "gameover";
      saveSession(stored);
      setSession({ ...stored });
      setPageStatus("gameover");
      window.history.replaceState(null, "", "/superbrain");
    } else if (resultParam === "ok") {
      const completedCount = stored.results.length;
      if (completedCount >= 5) {
        stored.status = "cleared";
        saveSession(stored);
        setSession({ ...stored });
        setPageStatus("cleared");
        incrementSuperBrainClearCount();
        window.history.replaceState(null, "", "/superbrain");
      } else {
        window.history.replaceState(null, "", "/superbrain");
        showNextGamePrep(stored);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function showNextGamePrep(currentSession: SuperBrainSession) {
    const sequence = getChallengeSequence();
    const nextIndex = currentSession.results.length;
    if (nextIndex >= 5) return;

    const gameId = currentSession.games[nextIndex];
    const difficulty = sequence[nextIndex];
    currentSession.challengeIndex = nextIndex;
    saveSession(currentSession);
    setSession({ ...currentSession });

    setPrepInfo({
      gameId,
      difficulty,
      challengeIndex: nextIndex,
      sessionId: currentSession.sessionId,
    });
    setPageStatus("preparing");
  }

  const handlePrepGo = useCallback(() => {
    if (!prepInfo) return;
    setPageStatus("launching");
    router.push(
      `/games/${prepInfo.gameId}?mode=superbrain&difficulty=${prepInfo.difficulty}&sessionId=${prepInfo.sessionId}`
    );
  }, [prepInfo, router]);

  function handleStart() {
    clearSession();
    const games = selectRandomGames(GAME_IDS);
    const newSession = createSession(games);
    saveSession(newSession);
    setSession(newSession);
    showNextGamePrep(newSession);
  }

  function handleRetry() {
    clearSession();
    setSession(null);
    setPrepInfo(null);
    setPageStatus("waiting");
  }

  function handleHome() {
    clearSession();
    router.push("/");
  }

  const showProgress = session && (
    pageStatus === "preparing" ||
    pageStatus === "launching" ||
    pageStatus === "gameover" ||
    pageStatus === "cleared"
  );

  return (
    <div className="game-container">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-black text-white text-center mb-4">🧠 SuperBrain</h1>

        {showProgress && (
          <ProgressBar results={session.results} totalSteps={5} />
        )}

        {pageStatus === "waiting" && <WaitingScreen onStart={handleStart} onHome={handleHome} />}

        {pageStatus === "preparing" && prepInfo && session && (
          <PreparingScreen
            prepInfo={prepInfo}
            session={session}
            onGo={handlePrepGo}
            onHome={handleHome}
          />
        )}

        {pageStatus === "launching" && (
          <div className="card p-8 flex flex-col items-center gap-4 animate-fade-in">
            <div className="text-4xl animate-spin">⚡</div>
            <p className="text-white font-bold">ゲームを起動中...</p>
            <button onClick={handleHome} className="btn-secondary text-sm mt-2">キャンセルしてTOPへ戻る</button>
          </div>
        )}

        {pageStatus === "gameover" && session && (
          <GameOverScreen session={session} onRetry={handleRetry} onHome={handleHome} />
        )}

        {pageStatus === "cleared" && session && (
          <ClearScreen session={session} onRetry={handleRetry} onHome={handleHome} />
        )}
      </div>
    </div>
  );
}

export default function SuperBrainPage() {
  return (
    <Suspense fallback={<div className="game-container"><div className="card p-8 text-center text-[#64748b]">読み込み中...</div></div>}>
      <SuperBrainPageInner />
    </Suspense>
  );
}
