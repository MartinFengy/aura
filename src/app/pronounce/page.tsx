"use client";

import { Suspense, useEffect } from "react";
import { RotateCcw, Volume2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { speakText } from "@/lib/speech";

function PronounceContent() {
  const searchParams = useSearchParams();
  const text = searchParams.get("text") ?? "";
  const label = searchParams.get("label") ?? text;

  useEffect(() => {
    if (text) {
      const timer = window.setTimeout(() => speakText(text), 180);
      return () => window.clearTimeout(timer);
    }
  }, [text]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(236,225,214,0.85),_rgba(245,241,235,0.92)_42%,_#f6f1ea_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_24px_80px_rgba(91,60,33,0.08)]">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Aura Pronunciation</p>
        <h1 className="mt-4 text-4xl font-semibold text-stone-900">{label || "发音播放"}</h1>
        <p className="mt-4 text-base leading-8 text-stone-600">
          打开页面后会自动播放这个单词或短语的读音，你也可以手动再次播放。
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => speakText(text)}
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm text-white"
          >
            <Volume2 className="h-4 w-4" />
            播放读音
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm text-stone-700"
          >
            <RotateCcw className="h-4 w-4" />
            重新加载并播放
          </button>
        </div>

        <div className="mt-8 rounded-[24px] border border-white/70 bg-[#fbf8f4] px-5 py-5">
          <p className="text-sm text-stone-500">播放文本</p>
          <p className="mt-2 text-xl font-medium text-stone-900">{text || "暂无可播放内容"}</p>
        </div>
      </div>
    </main>
  );
}

export default function PronouncePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f6f1ea] px-6 py-10 text-stone-600">正在准备发音播放...</main>}>
      <PronounceContent />
    </Suspense>
  );
}
