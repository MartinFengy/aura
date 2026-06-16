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
import {
  ARK_MODEL_OPTIONS,
  DEFAULT_FEISHU_LINK,
  getArkModelOption,
} from "@/lib/aura-config";

export default function SettingsPage() {
  const { config, setFeishuLink, setArkModel, setArkBaseUrl, resetFeishuLink } = useAuraConfig();
  const [statusMessage, setStatusMessage] = useState("等待操作");
  const selectedModel = getArkModelOption(config.arkModel);

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
                <select
                  value={config.arkModel}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    const nextModel = getArkModelOption(nextValue);
                    setArkModel(nextValue);
                    if (nextModel?.defaultBaseUrl) {
                      setArkBaseUrl(nextModel.defaultBaseUrl);
                    }
                  }}
                  className="w-full rounded-[22px] border border-white/70 bg-white/85 px-4 py-3 text-sm text-stone-700 outline-none"
                >
                  {ARK_MODEL_OPTIONS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[22px] border border-white/65 bg-white/75 px-4 py-4">
                <p className="text-sm text-stone-500">可切换模型详情</p>
                <div className="mt-3 flex flex-col gap-2">
                  {ARK_MODEL_OPTIONS.map((model) => (
                    <a
                      key={model.value}
                      href={model.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-sm underline-offset-4 hover:underline ${
                        config.arkModel === model.value ? "font-medium text-stone-900" : "text-stone-600"
                      }`}
                    >
                      {model.label}
                    </a>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setStatusMessage(
                    `模型配置已记录。之后从当前浏览器发起的新分析请求，会使用 ${selectedModel?.label ?? config.arkModel}，对应在线推理 Model ID：${selectedModel?.apiModel ?? "未识别"}。`,
                  )
                }
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
                { label: "当前模型", value: config.arkModel },
                { label: "在线推理 Model ID", value: selectedModel?.apiModel ?? "未识别" },
                { label: "模型服务地址", value: config.arkBaseUrl },
                { label: "API Key 设置", value: "请写入 .env.local 并重启服务" },
                { label: "默认飞书回退", value: DEFAULT_FEISHU_LINK },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex min-w-0 flex-col gap-2 rounded-[22px] border border-white/65 bg-white/70 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 text-stone-500">{item.label}</span>
                  <span className="min-w-0 break-all text-left text-stone-800 sm:max-w-[60%] sm:text-right">
                    {item.value}
                  </span>
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
