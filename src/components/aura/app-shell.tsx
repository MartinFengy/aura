"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  LogOut,
  Menu,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { learningStats, navItems } from "@/lib/aura-data";
import { useLearningTasks } from "@/hooks/use-learning-tasks";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import { clearActiveUserKey } from "@/lib/learning-store";
import { GlassCard } from "@/components/aura/glass-card";
import { BalloonBackground } from "@/components/aura/balloon-background";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { learningOverview } = useLearningTasks();
  const showLearningStats = pathname.startsWith("/lexicon");
  const activeItem = useMemo(
    () => navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0],
    [pathname],
  );
  const stats = useMemo(
    () =>
      learningStats.map((item) => {
        if (item.label === "总词汇量") {
          return { ...item, value: `${learningOverview.totalVocabulary}`, focus: "total" };
        }
        if (item.label === "已掌握") {
          return { ...item, value: `${learningOverview.mastered}`, focus: "mastered" };
        }
        if (item.label === "模糊词汇") {
          return { ...item, value: `${learningOverview.fuzzy}`, focus: "fuzzy" };
        }
        if (item.label === "错题词汇") {
          return { ...item, value: `${learningOverview.wrong}`, focus: "wrong" };
        }
        return { ...item, focus: "total" };
      }),
    [learningOverview],
  );

  async function handleLogout() {
    const client = getSupabaseBrowserClient();
    if (client && hasSupabaseEnv()) {
      await client.auth.signOut();
    }
    clearActiveUserKey();
    router.push("/login");
  }

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    document.body.dataset.mobileNavOpen = "true";
    return () => {
      delete document.body.dataset.mobileNavOpen;
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(236,225,214,0.85),_rgba(245,241,235,0.92)_42%,_#f6f1ea_100%)] text-stone-900">
      <BalloonBackground />

      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="glass-panel hidden w-[290px] shrink-0 flex-col justify-between p-5 lg:flex">
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-stone-500">
                  LINGYU
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[0.08em] text-stone-900">
                  Aura
                </h1>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  听音识词，反复成章
                </p>
              </div>
              <div className="rounded-full border border-white/60 bg-white/70 p-2 text-stone-700 shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>

            <nav className="space-y-2">
              {navItems.map(({ label, href, icon: Icon }) => {
                const active = pathname.startsWith(href);

                return (
                  <Link
                    key={label}
                    href={href}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                      active
                        ? "bg-stone-900 text-white shadow-lg shadow-stone-900/15"
                        : "bg-white/55 text-stone-700 hover:bg-white/80"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {label}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-70" />
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-[28px] bg-stone-900 px-5 py-4 text-sm text-stone-50 shadow-xl shadow-stone-900/20 transition hover:bg-stone-800"
            >
              <span className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                退出登录
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="rounded-[28px] border border-white/65 bg-white/70 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#efe4d5] p-2 text-stone-700">
                  <UserRound className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Aura Learner</p>
                  <p className="text-xs text-stone-500">{activeItem.description}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6 pb-[var(--mobile-nav-offset)] lg:pb-6">
          <GlassCard className="p-4 sm:p-5 lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">LINGYU</p>
                <h2 className="mt-2 text-3xl font-semibold text-stone-900">Aura</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-3 py-2 text-sm text-stone-50 shadow-lg shadow-stone-900/15 transition hover:bg-stone-800"
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </button>
                <button
                  type="button"
                  onClick={() => setMobileOpen((current) => !current)}
                  className="rounded-full border border-white/70 bg-white/80 p-3 text-stone-700"
                  aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
                >
                  {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {mobileOpen ? (
              <div className="mt-4 grid max-h-[70vh] gap-2 overflow-y-auto pr-1">
                {navItems.map(({ label, href, icon: Icon }) => {
                  const active = pathname.startsWith(href);

                  return (
                    <Link
                      key={label}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                        active ? "bg-stone-900 text-white" : "bg-white/80 text-stone-700"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  );
                })}
                <div className="mt-2 rounded-[24px] border border-white/65 bg-white/75 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-[#efe4d5] p-2 text-stone-700">
                      <UserRound className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-800">Aura Learner</p>
                      <p className="text-xs text-stone-500">{activeItem.description}</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center justify-between rounded-2xl bg-stone-900 px-4 py-3 text-sm text-stone-50 shadow-lg shadow-stone-900/15 transition hover:bg-stone-800"
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-80" />
                </button>
              </div>
            ) : null}
          </GlassCard>

          {showLearningStats ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(({ label, value, icon: Icon, focus }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = `/journey?focus=${focus}#journey-word-details`;
                    } else {
                      router.push(`/journey?focus=${focus}#journey-word-details`);
                    }
                  }}
                  className="text-left"
                >
                  <GlassCard className="p-3 sm:p-4 transition hover:bg-white/90">
                    <div className="flex items-start justify-between">
                      <p className="text-[11px] text-stone-500 sm:text-sm">{label}</p>
                      <div className="rounded-full bg-[#f1e8dc] p-1.5 text-stone-700 sm:p-2">
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-[0.04em] text-stone-900 sm:mt-4 sm:text-3xl">
                      {value}
                    </p>
                  </GlassCard>
                </button>
              ))}
            </div>
          ) : null}

          {children}
        </div>
      </div>

      <nav
        className="mobile-bottom-nav fixed inset-x-3 z-30 lg:hidden"
      >
        <div className="glass-panel flex items-center justify-between px-3 py-2">
          {navItems.map(({ label, shortLabel, href, icon: Icon }) => {
            const active = pathname.startsWith(href);

            return (
              <Link
                key={label}
                href={href}
                className={`flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs ${
                  active ? "bg-stone-900 text-white" : "text-stone-600"
                }`}
              >
                <Icon className="h-4 w-4" />
                {shortLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
