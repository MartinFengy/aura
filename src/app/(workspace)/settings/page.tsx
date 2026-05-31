"use client";

import { useState } from "react";
import {
  CheckCheck,
  Cpu,
  Link2,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { GlassCard } from "@/components/aura/glass-card";
import { useAuraConfig } from "@/hooks/use-aura-config";
import { DEFAULT_FEISHU_LINK } from "@/lib/aura-config";

export default function SettingsPage() {
  const { config, setFeishuLink, setArkModel, setArkBaseUrl, resetFeishuLink } = useAuraConfig();
  const [statusMessage, setStatusMessage] = useState("等待操作");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
            <Link2 className="h-4 w-4" />
            飞书连接
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-stone-900">可点击的同步配置</h3>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm text-stone-600">默认飞书文档</span>
            <input
              value={config.feishuLink}
              onChange={(event) => setFeishuLink(event.target.value)}
              className="w-full rounded-[22px] border border-white/70 bg-white/85 px-4 py-3 text-sm text-stone-700 outline-none"
            />
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["修改飞书链接", "恢复默认链接", "增量追加内容"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label === "恢复默认链接") {
                    resetFeishuLink();
                  }
                  setStatusMessage(`已执行：${label}`);
                }}
                className="rounded-[22px] border border-white/65 bg-white/75 px-4 py-3 text-sm text-stone-700 transition hover:bg-white"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] bg-stone-900 px-4 py-4 text-sm text-stone-100">
            {statusMessage}
          </div>
        </GlassCard>

        <div className="grid gap-6">
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
              <Cpu className="h-4 w-4" />
              模型配置
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-stone-600">Ark Base URL</span>
                <input
                  value={config.arkBaseUrl}
                  onChange={(event) => setArkBaseUrl(event.target.value)}
                  className="w-full rounded-[22px] border border-white/70 bg-white/85 px-4 py-3 text-sm text-stone-700 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-stone-600">模型名称</span>
                <input
                  value={config.arkModel}
                  onChange={(event) => setArkModel(event.target.value)}
                  className="w-full rounded-[22px] border border-white/70 bg-white/85 px-4 py-3 text-sm text-stone-700 outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() => setStatusMessage("模型配置已记录，真实生效需同步写入 .env.local 后重启服务。")}
                className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
              >
                <Save className="h-4 w-4" />
                保存显示配置
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
              <Sparkles className="h-4 w-4" />
              当前接入状态
            </div>
            <div className="mt-5 space-y-3">
              {[
                { label: "飞书同步目标", value: config.feishuLink },
                { label: "Doubao 模型", value: config.arkModel },
                { label: "模型服务地址", value: config.arkBaseUrl },
                { label: "Ark Key 设置", value: "请写入 .env.local 并重启服务" },
                { label: "默认飞书回退", value: DEFAULT_FEISHU_LINK },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-[22px] border border-white/65 bg-white/70 px-4 py-4 text-sm"
                >
                  <span className="text-stone-500">{item.label}</span>
                  <span className="max-w-[60%] truncate text-stone-800">{item.value}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "飞书连接", value: "Ready", icon: CheckCheck },
                { label: "模型状态", value: config.arkModel, icon: Cpu },
                { label: "鉴权方式", value: "Supabase", icon: ShieldCheck },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-white/65 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-stone-500">{label}</p>
                    <Icon className="h-4 w-4 text-stone-700" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-stone-900">{value}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
