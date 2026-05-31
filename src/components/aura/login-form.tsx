"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import { setActiveUserKey } from "@/lib/learning-store";

type Mode = "login" | "register";

export function LoginForm() {
  const router = useRouter();
  const supabaseEnabled = useMemo(() => hasSupabaseEnv(), []);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handlePasswordReset() {
    if (!email.trim()) {
      setMessage("请先输入注册时使用的邮箱。");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "reset", email }),
      });

      const result = (await response.json().catch(() => ({
        error: "重置密码返回格式异常。",
      }))) as { error?: string; message?: string };

      setLoading(false);
      setMessage(result.message ?? result.error ?? "已发送重置密码邮件，请检查邮箱。");
    } catch (error) {
      setLoading(false);
      setMessage(
        error instanceof Error
          ? `发送重置邮件失败：${error.message}`
          : "发送重置邮件失败，请稍后重试。",
      );
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (!supabaseEnabled) {
      setLoading(false);
      setActiveUserKey(email);
      setMessage("未检测到 Supabase 环境变量，已切换为演示模式。");
      router.push("/reading");
      return;
    }

    let response: Response;

    try {
      response = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode, email, password }),
      });
    } catch (error) {
      setLoading(false);
      setMessage(
        error instanceof Error
          ? `登录请求失败：${error.message}`
          : "登录请求失败，请检查本地服务和网络。",
      );
      return;
    }

    const result = (await response.json().catch(() => ({ error: "登录返回格式异常。" }))) as {
      error?: string;
      errorCode?: string;
      message?: string;
      session?: { access_token: string; refresh_token: string } | null;
    };

    if (!response.ok || result.error) {
      if (result.errorCode === "SUPABASE_UNREACHABLE") {
        setLoading(false);
        setActiveUserKey(email);
        setMessage("Supabase 认证服务当前不可达，已切换为本地工作模式。请稍后检查 Supabase 项目地址或网络状态。");
        window.setTimeout(() => {
          router.push("/reading");
        }, 500);
        return;
      }
      if (result.errorCode === "INVALID_LOGIN_CREDENTIALS") {
        setLoading(false);
        setMessage("邮箱或密码不正确。你可以检查密码，或点击“忘记密码”发送重置邮件。");
        return;
      }
      setLoading(false);
      setMessage(result.error ?? "登录失败，请稍后重试。");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (supabase && result.session) {
      await supabase.auth.setSession(result.session);
    }
    setActiveUserKey(email);

    setLoading(false);
    setMessage(
      mode === "login"
        ? "登录成功，正在进入学习空间。"
        : result.message ?? "注册成功，请检查邮箱确认链接，确认后再登录。",
    );
    if (result.session) {
      router.push("/reading");
    }
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-full border border-white/70 bg-white/70 p-1">
        {[
          { value: "login", label: "登录", icon: KeyRound },
          { value: "register", label: "注册", icon: UserRoundPlus },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value as Mode)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
              mode === value ? "bg-stone-900 text-white" : "text-stone-600"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm text-stone-600">
            <Mail className="h-4 w-4" />
            邮箱
          </span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="hello@aura.study"
            className="w-full rounded-[22px] border border-white/75 bg-white/85 px-4 py-3 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-stone-300"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm text-stone-600">
            <KeyRound className="h-4 w-4" />
            密码
          </span>
          <div className="flex items-center gap-3 rounded-[22px] border border-white/75 bg-white/85 px-4 py-3">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="输入至少 6 位密码"
              className="min-w-0 flex-1 bg-transparent text-stone-800 outline-none placeholder:text-stone-400"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="text-stone-500 transition hover:text-stone-800"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-stone-900 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {mode === "login" ? "进入学习空间" : "创建 Aura 账号"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>

        {mode === "login" ? (
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={loading}
            className="w-full rounded-[22px] border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            忘记密码，发送重置邮件
          </button>
        ) : null}
      </form>

      <div className="rounded-[24px] border border-dashed border-stone-300/70 bg-[#fbf6ef] px-4 py-4 text-sm leading-7 text-stone-600">
        {supabaseEnabled
          ? "已启用 Supabase Auth。登录后将直接进入独立模块工作区。"
          : "尚未配置 Supabase 环境变量。现在会以演示模式进入，但登录表单和结构已接好。"}
      </div>

      {message ? (
        <div className="rounded-[20px] border border-white/70 bg-white/80 px-4 py-3 text-sm text-stone-700">
          {message}
        </div>
      ) : null}
    </div>
  );
}
