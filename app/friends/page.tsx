"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getUserId } from "@/lib/nickname";
import { getMyFriendCode } from "@/app/actions/friends";
import type { FriendEntry, PendingRequest } from "@/lib/db-types";

const APP_URL = "https://brain-game-opal.vercel.app";

async function handleShare(friendCode: string) {
  const shareText = `🧠 BrainGameで友達になろう！\nフレンドコード: ${friendCode}\n${APP_URL}/add-friend?code=${friendCode}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "BrainGame フレンド招待",
        text: `フレンドコード: ${friendCode}`,
        url: `${APP_URL}/add-friend?code=${friendCode}`,
      });
    } catch {
      // ユーザーがキャンセルした場合は何もしない
    }
  } else {
    const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;
    window.open(lineUrl, "_blank", "noopener,noreferrer");
  }
}

export default function FriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [requestCode, setRequestCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [requestMessage, setRequestMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  const fetchFriends = async (uid: string) => {
    const res = await fetch(`/api/friends?userId=${uid}`);
    if (res.ok) setFriends(await res.json());
  };

  const fetchPending = async (uid: string) => {
    const res = await fetch(`/api/friends/pending?userId=${uid}`);
    if (res.ok) setPending(await res.json());
  };

  useEffect(() => {
    setMounted(true);
    const uid = getUserId();
    setUserId(uid);
    if (!uid) return;

    // 並列フェッチ
    Promise.all([fetchFriends(uid), fetchPending(uid)]);

    // フレンドコード取得（Server Action）
    getMyFriendCode(uid).then(setMyCode).catch(console.error);
  }, []);

  const handleCopy = async () => {
    if (!myCode) return;
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードアクセス失敗
    }
  };

  const handleRequest = async () => {
    if (!userId || requestCode.length !== 6) return;
    setRequestStatus("loading");
    setRequestMessage("");

    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, friendCode: requestCode.toUpperCase() }),
      });
      const data = await res.json();

      if (res.ok) {
        setRequestStatus("success");
        setRequestMessage(`${data.addresseeNickname} さんに申請を送りました`);
        setRequestCode("");
        await Promise.all([fetchFriends(userId), fetchPending(userId)]);
        setTimeout(() => setRequestStatus("idle"), 3000);
      } else {
        setRequestStatus("error");
        setRequestMessage(data.error ?? "申請に失敗しました");
        setTimeout(() => setRequestStatus("idle"), 3000);
      }
    } catch {
      setRequestStatus("error");
      setRequestMessage("通信エラーが発生しました");
      setTimeout(() => setRequestStatus("idle"), 3000);
    }
  };

  const handleRespond = async (requesterId: string, action: "accept" | "reject") => {
    if (!userId) return;

    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, requesterId, action }),
      });

      if (res.ok) {
        await fetchPending(userId);
        if (action === "accept") {
          await fetchFriends(userId);
        }
      }
    } catch {
      console.error("respond error");
    }
  };

  if (!mounted) return null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-[#6c63ff] hover:underline">← ホーム</Link>
        <h1 className="text-3xl font-black text-white">👥 フレンド</h1>
      </div>

      {/* 自分のフレンドコード */}
      <section className="card p-6 mb-4">
        <h2 className="text-lg font-bold text-white mb-4">あなたのフレンドコード</h2>
        {myCode ? (
          <div className="flex flex-col gap-3">
            <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl px-6 py-4 text-center">
              <p className="text-3xl font-mono font-black text-[#6c63ff] tracking-widest">{myCode}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a4a] border border-[#2a2a4a] text-white text-sm font-bold px-4 py-2 rounded-xl transition-all"
              >
                {copied ? "コピー済み ✓" : "📋 コピー"}
              </button>
              <button
                onClick={() => handleShare(myCode)}
                className="flex-1 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-bold px-4 py-2 rounded-xl transition-all"
              >
                📤 シェア
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-pulse">
            <div className="h-14 bg-[#2a2a4a] rounded-xl" />
          </div>
        )}
      </section>

      {/* 受信申請 */}
      {pending.length > 0 && (
        <section className="card p-6 mb-4 border-yellow-500/30">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            申請が届いています
            <span className="bg-yellow-500 text-black text-xs font-black px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </h2>
          <div className="flex flex-col gap-3">
            {pending.map((req) => (
              <div key={req.requesterId} className="flex items-center justify-between bg-[#0f0f1a] rounded-xl px-4 py-3">
                <div>
                  <p className="text-white font-bold">{req.requesterNickname}</p>
                  <p className="text-[#64748b] text-xs">{new Date(req.createdAt).toLocaleDateString("ja-JP")}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(req.requesterId, "accept")}
                    className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => handleRespond(req.requesterId, "reject")}
                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    拒否
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* フレンド申請フォーム */}
      <section className="card p-6 mb-4">
        <h2 className="text-lg font-bold text-white mb-4">フレンドを追加</h2>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={requestCode}
            onChange={(e) => setRequestCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="フレンドコードを入力（6文字）"
            maxLength={6}
            className="w-full bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl px-4 py-3 text-white font-mono text-xl tracking-widest text-center focus:outline-none focus:border-[#6c63ff] transition-colors"
          />

          {requestMessage && (
            <div className={`text-sm px-4 py-3 rounded-xl ${
              requestStatus === "success"
                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                : "bg-red-500/10 text-red-400 border border-red-500/30"
            }`}>
              {requestMessage}
            </div>
          )}

          <button
            onClick={handleRequest}
            disabled={requestCode.length !== 6 || requestStatus === "loading"}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {requestStatus === "loading" ? "申請中..." : "フレンド申請を送る"}
          </button>
        </div>
      </section>

      {/* フレンド一覧 */}
      <section className="card p-6 mb-4">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          フレンド一覧
          <span className="text-[#64748b] text-sm font-normal">({friends.length}人)</span>
        </h2>
        {friends.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-white font-bold mb-1">まだフレンドがいません</p>
            <p className="text-[#64748b] text-sm">フレンドコードを共有して友達を招待しましょう</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {friends.map((friend) => (
              <div key={friend.userId} className="flex items-center gap-3 bg-[#0f0f1a] rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-[#6c63ff]/20 flex items-center justify-center text-[#6c63ff] font-bold text-sm">
                  {friend.nickname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{friend.nickname}</p>
                  {friend.friendCode && (
                    <p className="text-[#64748b] text-xs font-mono">{friend.friendCode}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* フレンドランキングへのリンク */}
      <Link
        href="/friends/ranking"
        className="card p-5 flex items-center justify-between hover:border-[#6c63ff] transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="text-white font-bold">フレンドランキング</p>
            <p className="text-[#64748b] text-sm">フレンドとスコアを競おう</p>
          </div>
        </div>
        <span className="text-[#64748b] group-hover:text-[#6c63ff] transition-colors">→</span>
      </Link>
    </main>
  );
}
