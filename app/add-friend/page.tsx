"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getUserId } from "@/lib/nickname";

function AddFriendContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code") ?? "";

  const [code, setCode] = useState(codeFromUrl.toUpperCase());
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setUserId(getUserId());
  }, []);

  const handleRequest = async () => {
    if (!userId || code.length !== 6) return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, friendCode: code.toUpperCase() }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(`${data.addresseeNickname} さんに申請を送りました`);
        setTimeout(() => {
          router.push("/friends");
        }, 1500);
      } else {
        setStatus("error");
        setMessage(data.error ?? "申請に失敗しました");
      }
    } catch {
      setStatus("error");
      setMessage("通信エラーが発生しました");
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/friends" className="text-sm text-[#6c63ff] hover:underline">← フレンド</Link>
        <h1 className="text-2xl font-black text-white">フレンドを追加</h1>
      </div>

      <div className="card p-6">
        <p className="text-[#64748b] text-sm mb-6">
          フレンドのフレンドコードを入力して申請を送りましょう。
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[#94a3b8] text-sm font-bold mb-2 block">
              フレンドコード（6文字）
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="例: ABC123"
              maxLength={6}
              className="w-full bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl px-4 py-3 text-white font-mono text-2xl tracking-widest text-center focus:outline-none focus:border-[#6c63ff] transition-colors"
            />
          </div>

          {message && (
            <div className={`text-sm px-4 py-3 rounded-xl ${
              status === "success"
                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                : "bg-red-500/10 text-red-400 border border-red-500/30"
            }`}>
              {message}
            </div>
          )}

          <button
            onClick={handleRequest}
            disabled={code.length !== 6 || status === "loading" || status === "success"}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? "申請中..." : "フレンド申請を送る"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function AddFriendPage() {
  return (
    <Suspense fallback={
      <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/friends" className="text-sm text-[#6c63ff] hover:underline">← フレンド</Link>
          <h1 className="text-2xl font-black text-white">フレンドを追加</h1>
        </div>
      </main>
    }>
      <AddFriendContent />
    </Suspense>
  );
}
