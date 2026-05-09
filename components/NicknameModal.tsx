"use client";
import { useEffect, useRef, useState } from "react";
import { getNickname, setNickname, getAge, setAge } from "@/lib/nickname";

interface Props {
  onClose: (nickname: string) => void;
  mode?: "setup" | "change";
}

export default function NicknameModal({ onClose, mode = "setup" }: Props) {
  const [value, setValue] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "change") {
      setValue(getNickname() ?? "");
      const age = getAge();
      setAgeValue(age !== null ? String(age) : "");
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [mode]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) { setError("ニックネームを入力してください"); return; }
    if (trimmed.length > 12) { setError("12文字以内で入力してください"); return; }
    if (ageValue !== "") {
      const age = parseInt(ageValue, 10);
      if (isNaN(age) || age < 1 || age > 120) { setError("年齢は1〜120で入力してください"); return; }
      setAge(age);
    }
    setNickname(trimmed);
    onClose(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
      <div className="card p-8 flex flex-col items-center gap-5 max-w-sm w-full mx-4 animate-scale-in">
        <div className="text-5xl">🧠</div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-white mb-1">
            {mode === "setup" ? "ようこそ！" : "プロフィール変更"}
          </h2>
          <p className="text-[#64748b] text-sm">
            {mode === "setup"
              ? "ランキングに表示されるニックネームを設定してください"
              : "プロフィールを変更してください"}
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <div>
            <label className="text-[#64748b] text-xs mb-1 block">ニックネーム</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              maxLength={12}
              placeholder="例: たろう, GameKing..."
              className="w-full text-center text-xl font-bold bg-[#0f0f1a] border-2 border-[#2a2a4a] focus:border-[#6c63ff] rounded-xl p-3 text-white outline-none transition-all"
            />
            <p className="text-[#64748b] text-xs mt-1 text-right">{value.trim().length}/12</p>
          </div>

          <div>
            <label className="text-[#64748b] text-xs mb-1 block">年齢（任意）</label>
            <input
              type="number"
              value={ageValue}
              onChange={(e) => { setAgeValue(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              min={1}
              max={120}
              placeholder="例: 25"
              className="w-full text-center text-xl font-bold bg-[#0f0f1a] border-2 border-[#2a2a4a] focus:border-[#6c63ff] rounded-xl p-3 text-white outline-none transition-all"
            />
          </div>

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        </div>

        <div className="flex gap-3 w-full">
          {mode === "change" && (
            <button
              onClick={() => onClose(getNickname() ?? "")}
              className="btn-secondary flex-1"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={value.trim().length === 0}
            className="btn-primary flex-1 disabled:opacity-40"
          >
            {mode === "setup" ? "はじめる！" : "変更する"}
          </button>
        </div>
      </div>
    </div>
  );
}
