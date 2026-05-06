"use client";
import Link from "next/link";

interface Props {
  title: string;
  description?: string;
}

export default function GameHeader({ title, description }: Props) {
  return (
    <div className="w-full flex flex-col items-center gap-2 mb-6">
      <Link href="/" className="self-start text-sm text-[#6c63ff] hover:underline mb-2">
        ← ホームに戻る
      </Link>
      <h1 className="text-3xl font-black text-white">{title}</h1>
      {description && <p className="text-[#64748b] text-sm text-center">{description}</p>}
    </div>
  );
}
