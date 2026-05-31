import {
  BrainCircuit,
  Languages,
  Link2,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { GlassCard } from "@/components/aura/glass-card";
import { LoginForm } from "@/components/aura/login-form";
import { BalloonBackground } from "@/components/aura/balloon-background";

const loginFeatures = [
  {
    title: "AI OCR 整理",
    text: "上传图片、PDF、DOCX 与截图，自动提取原文与高级表达。",
    icon: ScanSearch,
  },
  {
    title: "词阁试炼",
    text: "支持听音写词、中文写英文、句子听写与选择题模式。",
    icon: Languages,
  },
  {
    title: "飞书沉淀",
    text: "把完整句子、词条、释义、例句与发音同步到知识库。",
    icon: Link2,
  },
];

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(236,225,214,0.85),_rgba(245,241,235,0.92)_42%,_#f6f1ea_100%)] text-stone-900">
      <BalloonBackground />

      <div className="mx-auto grid min-h-screen max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <GlassCard className="flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.28em] text-stone-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI English Learning System
            </div>
            <p className="mt-6 text-xs uppercase tracking-[0.35em] text-stone-500">LINGYU</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[0.08em] text-stone-900 sm:text-6xl">
              Aura
            </h1>
            <p className="mt-4 text-lg leading-8 text-stone-600">
              听音识词，反复成章。用更轻盈的方式，把英语材料整理、复习、对话和沉淀串成长期系统。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {loginFeatures.map(({ title, text, icon: Icon }) => (
              <div
                key={title}
                className="rounded-[28px] border border-white/70 bg-white/75 p-5"
              >
                <div className="inline-flex rounded-2xl bg-[#efe4d5] p-3 text-stone-800">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-stone-900">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-stone-600">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[30px] bg-stone-900 px-5 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/12 p-3">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-stone-300">Aura Workflow</p>
                <p className="mt-1 text-sm text-stone-200">
                  上传即整理，对话即学习，飞书即沉淀。
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-[0.28em] text-stone-500">Welcome Back</p>
            <h2 className="mt-3 text-4xl font-semibold text-stone-900">登录你的学习空间</h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              使用 Supabase Auth 管理账户，进入带独立模块路由的 Aura 工作区。
            </p>
          </div>
          <LoginForm />
        </GlassCard>
      </div>
    </main>
  );
}
