"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flame,
  PieChart,
  Trash2,
  TrendingUp,
  Volume2,
} from "lucide-react";
import { GlassCard } from "@/components/aura/glass-card";
import { useLearningTasks } from "@/hooks/use-learning-tasks";
import { speakText } from "@/lib/speech";

const trendTabs = ["学习趋势", "正确率趋势"] as const;
const sessionPageSize = 6;
const wordPageSize = 8;

function getSessionDateParts(createdAt: string) {
  const match = createdAt.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!match) {
    return {
      key: createdAt.slice(0, 10),
      label: createdAt.slice(5, 10),
    };
  }

  return {
    key: `${match[1]}/${match[2]}/${match[3]}`,
    label: `${match[2]}/${match[3]}`,
  };
}

function JourneyContent() {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") ?? "total";
  const { learningOverview, practiceHistory, tasks, deleteDictationSession } = useLearningTasks();
  const [activeTrend, setActiveTrend] = useState<(typeof trendTabs)[number]>(trendTabs[0]);
  const [expandedSessionId, setExpandedSessionId] = useState("");
  const [sessionPage, setSessionPage] = useState(1);
  const [wordPage, setWordPage] = useState(1);
  const [wordDetailsExpanded, setWordDetailsExpanded] = useState(true);

  const sessionTotalPages = Math.max(1, Math.ceil(practiceHistory.length / sessionPageSize));
  const safeSessionPage = Math.min(sessionPage, sessionTotalPages);
  const pagedSessions = useMemo(() => {
    const start = (safeSessionPage - 1) * sessionPageSize;
    return practiceHistory.slice(start, start + sessionPageSize);
  }, [practiceHistory, safeSessionPage]);

  const recentDays = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        label: string;
        sessionCount: number;
        totalQuestions: number;
        correctCount: number;
      }
    >();

    practiceHistory.forEach((session) => {
      const { key, label } = getSessionDateParts(session.createdAt);
      const current = grouped.get(key) ?? {
        key,
        label,
        sessionCount: 0,
        totalQuestions: 0,
        correctCount: 0,
      };

      current.sessionCount += 1;
      current.totalQuestions += session.totalQuestions;
      current.correctCount += session.correctCount;
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .sort((left, right) => left.key.localeCompare(right.key))
      .slice(-7);
  }, [practiceHistory]);

  const trendBars = useMemo(() => {
    if (recentDays.length === 0) {
      return [];
    }

    const maxSessionCount = Math.max(...recentDays.map((day) => day.sessionCount), 1);
    const bars = recentDays.map((day) => {
      if (activeTrend === "正确率趋势") {
        return day.totalQuestions
          ? Math.max(18, Math.round((day.correctCount / day.totalQuestions) * 100))
          : 18;
      }
      return Math.max(18, Math.round((day.sessionCount / maxSessionCount) * 100));
    });

    while (bars.length < 7) {
      bars.unshift(18);
    }

    return bars;
  }, [activeTrend, recentDays]);

  const trendLabels = useMemo(() => {
    if (recentDays.length === 0) {
      return [];
    }

    const labels = recentDays.map((day) => day.label);

    while (labels.length < 7) {
      labels.unshift("--/--");
    }

    return labels;
  }, [recentDays]);

  useEffect(() => {
    if (focus === "total") {
      return;
    }

    const element = document.getElementById("journey-word-details");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  const masteryBars = useMemo(() => {
    const total = Math.max(learningOverview.totalVocabulary, 1);
    return [
      {
        label: "已掌握",
        width: `${Math.round((learningOverview.mastered / total) * 100)}%`,
      },
      {
        label: "复习中",
        width: `${Math.round((learningOverview.fuzzy / total) * 100)}%`,
      },
      {
        label: "高频错词",
        width: `${Math.round((learningOverview.wrong / total) * 100)}%`,
      },
    ];
  }, [learningOverview]);

  const mistakeWords = useMemo(() => {
    const counts = new Map<string, number>();
    practiceHistory.forEach((session) => {
      session.answers.forEach((answer) => {
        if (answer.result === "不认识") {
          counts.set(answer.vocabulary, (counts.get(answer.vocabulary) ?? 0) + 1);
        }
      });
    });

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([term, score]) => ({ term, score: `${score} 次` }));
  }, [practiceHistory]);

  const focusedWords = useMemo(() => {
    const entryProgress = new Map<string, { correct: number; fuzzy: number; wrong: number }>();

    practiceHistory.forEach((session) => {
      session.answers.forEach((answer) => {
        const key = `${answer.taskId}:${answer.entryId}`;
        const current = entryProgress.get(key) ?? { correct: 0, fuzzy: 0, wrong: 0 };
        if (answer.result === "认识") current.correct += 1;
        if (answer.result === "模糊") current.fuzzy += 1;
        if (answer.result === "不认识") current.wrong += 1;
        entryProgress.set(key, current);
      });
    });

    const allEntries = tasks.flatMap((task) =>
      task.entries.map((entry) => ({
        ...entry,
        taskId: task.id,
        key: `${task.id}:${entry.id}`,
      })),
    );

    return allEntries.filter((entry) => {
      const stats = entryProgress.get(entry.key) ?? { correct: 0, fuzzy: 0, wrong: 0 };
      if (focus === "mastered") {
        return stats.correct > stats.fuzzy + stats.wrong;
      }
      if (focus === "fuzzy") {
        return stats.fuzzy > 0 && stats.correct <= stats.fuzzy + stats.wrong;
      }
      if (focus === "wrong") {
        return stats.wrong > 0 && stats.wrong >= stats.correct;
      }
      return true;
    });
  }, [focus, practiceHistory, tasks]);

  const focusTitle =
    focus === "mastered"
      ? "已掌握词汇"
      : focus === "fuzzy"
        ? "模糊词汇"
        : focus === "wrong"
          ? "错题词汇"
          : "全部词汇";

  const wordTotalPages = Math.max(1, Math.ceil(focusedWords.length / wordPageSize));
  const safeWordPage = Math.min(wordPage, wordTotalPages);
  const pagedFocusedWords = useMemo(() => {
    const start = (safeWordPage - 1) * wordPageSize;
    return focusedWords.slice(start, start + wordPageSize);
  }, [focusedWords, safeWordPage]);

  const trendYAxisLabel =
    activeTrend === "学习趋势"
      ? "纵轴：当天完成的听写次数，柱子越高表示这一天练得越多。"
      : "纵轴：当天全部听写结果汇总后的得分率（正确题数 / 总题数）。";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
            <TrendingUp className="h-4 w-4" />
            趋势图表
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {trendTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTrend(tab)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  activeTrend === tab
                    ? "bg-stone-900 text-white"
                    : "border border-white/70 bg-white/75 text-stone-600 hover:bg-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[26px] border border-white/65 bg-[#fffdfa] p-4">
            <p className="text-sm text-stone-500">{activeTrend}</p>
            <p className="mt-2 text-xs leading-6 text-stone-500">{trendYAxisLabel}</p>
            {trendBars.length > 0 ? (
              <>
                <div className="mt-4 flex h-52 items-end gap-3">
                  {trendBars.map((value, index) => (
                    <div key={`${value}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <div
                        className="w-full rounded-t-full bg-[linear-gradient(180deg,#cfae84,#8f6948)]"
                        style={{ height: `${value}%`, minHeight: 18 }}
                      />
                      <span className="text-xs text-stone-400">
                        {trendLabels[index] ?? String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-6 text-stone-400">
                  横轴：最近 7 个有听写记录的日期，按 `月/日` 展示，越靠右表示越新的日期。
                </p>
              </>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-stone-200 bg-white/60 px-4 py-8 text-sm leading-7 text-stone-500">
                还没有听写记录，完成一次词阁听写后，这里会显示真实的学习趋势和正确率趋势。
              </div>
            )}
          </div>
        </GlassCard>

        <div className="grid gap-6">
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
              <PieChart className="h-4 w-4" />
              词汇掌握占比
            </div>
            <div className="mt-5 space-y-4">
              {masteryBars.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm text-stone-600">
                    <span>{item.label}</span>
                    <span>{item.width}</span>
                  </div>
                  <div className="h-3 rounded-full bg-[#ede3d8]">
                    <div
                      className="h-3 rounded-full bg-[linear-gradient(90deg,#8f6948,#d7bf9a)]"
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
              <Flame className="h-4 w-4" />
              高频错词排行榜
            </div>
            <div className="mt-5 space-y-3">
              {mistakeWords.length > 0 ? (
                mistakeWords.map((item, index) => (
                  <div
                    key={`${item.term}-${index}`}
                    className="flex items-center justify-between rounded-[22px] border border-white/65 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-[#f1e8dc] px-3 py-1 text-sm font-medium text-stone-800">
                        {index + 1}
                      </div>
                      <span className="text-stone-700">{item.term}</span>
                    </div>
                    <span className="text-sm text-stone-500">{item.score}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-stone-200 bg-white/60 px-4 py-6 text-sm text-stone-500">
                  暂时没有错题记录。删除听写结果后，这里的排行也会同步清空。
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      <div id="journey-word-details">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
              <PieChart className="h-4 w-4" />
              词汇详情
            </div>
            <button
              type="button"
              onClick={() => setWordDetailsExpanded((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"
            >
              {wordDetailsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {wordDetailsExpanded ? "收起词汇详情" : "展开词汇详情"}
            </button>
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-stone-900">{focusTitle}</h3>
          {wordDetailsExpanded ? (
            <>
              <div className="mt-4 flex flex-col gap-3 rounded-[24px] border border-white/70 bg-[#fbf8f4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-stone-600">
                  当前显示 {pagedFocusedWords.length} / {focusedWords.length} 条，第 {safeWordPage} / {wordTotalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWordPage(Math.max(1, safeWordPage - 1))}
                    disabled={safeWordPage === 1}
                    className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => setWordPage(Math.min(wordTotalPages, safeWordPage + 1))}
                    disabled={safeWordPage === wordTotalPages}
                    className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-40"
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {pagedFocusedWords.length > 0 ? (
                  pagedFocusedWords.map((entry) => (
                    <div
                      key={`${entry.taskId}-${entry.id}`}
                      className="rounded-[22px] border border-white/65 bg-white/70 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-stone-900">{entry.vocabulary}</p>
                        <button
                          type="button"
                          onClick={() => speakText(entry.vocabulary)}
                          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          播放
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-stone-600">{entry.chinese}</p>
                      <p className="mt-2 text-sm leading-7 text-stone-500">{entry.example}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-white/65 bg-white/70 px-4 py-4 text-sm text-stone-500 lg:col-span-2">
                    当前分类下还没有可展示的词汇内容。
                  </div>
                )}
              </div>
            </>
          ) : null}
        </GlassCard>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
            <TrendingUp className="h-4 w-4" />
            听写结果记录
          </div>
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <button
              type="button"
              onClick={() => setSessionPage(Math.max(1, safeSessionPage - 1))}
              disabled={safeSessionPage === 1}
              className="rounded-full border border-stone-200 bg-white px-3 py-2 disabled:opacity-40"
            >
              上一页
            </button>
            <span>
              第 {safeSessionPage} / {sessionTotalPages} 页
            </span>
            <button
              type="button"
              onClick={() => setSessionPage(Math.min(sessionTotalPages, safeSessionPage + 1))}
              disabled={safeSessionPage === sessionTotalPages}
              className="rounded-full border border-stone-200 bg-white px-3 py-2 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {(pagedSessions.length > 0 ? pagedSessions : []).map((session) => (
            <div
              key={session.id}
              className={`rounded-[24px] border border-white/70 bg-white/75 px-4 py-4 ${
                session.answers.length > 0 ? "cursor-pointer" : ""
              }`}
              onClick={() => {
                if (session.answers.length === 0) {
                  return;
                }
                setExpandedSessionId((current) => (current === session.id ? "" : session.id));
              }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-800">
                    {Array.isArray(session.taskNames) ? session.taskNames.join("、") : session.taskNames}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">{session.createdAt}</p>
                </div>
                <div className="flex flex-col gap-3 lg:items-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteDictationSession(session.id);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除记录
                  </button>
                  <div className="grid gap-2 sm:grid-cols-4">
                  {[
                    { label: "总题数", value: `${session.totalQuestions}` },
                    { label: "正确", value: `${session.correctCount}` },
                    { label: "模糊", value: `${session.fuzzyCount}` },
                    { label: "错题", value: `${session.wrongCount}` },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-white/65 bg-[#fffdfa] px-3 py-3 text-center"
                    >
                      <p className="text-xs text-stone-500">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold text-stone-900">{item.value}</p>
                    </div>
                  ))}
                  </div>
                </div>
              </div>

              {session.answers.length > 0 ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedSessionId((current) => (current === session.id ? "" : session.id));
                    }}
                    className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
                  >
                    {expandedSessionId === session.id ? "收起详细结果" : "查看详细结果"}
                  </button>
                  {expandedSessionId === session.id ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {session.answers.map((answer, index) => (
                        <div
                          key={`${session.id}-${answer.entryId}-${index}`}
                          className={`rounded-[18px] border px-4 py-3 ${
                            answer.result === "不认识"
                              ? "border-red-200 bg-red-50"
                              : answer.result === "模糊"
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-white/65 bg-[#fffdfa]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-stone-900">{answer.vocabulary}</p>
                              <p className="mt-1 text-sm text-stone-500">{answer.chinese}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                speakText(answer.vocabulary);
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700"
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                              播放
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-stone-500">原句：{answer.sentence}</p>
                          <p className="mt-2 text-xs text-stone-500">例句：{answer.example}</p>
                          <p
                            className={`mt-3 text-sm font-medium ${
                              answer.result === "不认识"
                                ? "text-red-600"
                                : answer.result === "模糊"
                                  ? "text-emerald-600"
                                  : "text-stone-700"
                            }`}
                          >
                            结果：{answer.result}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {pagedSessions.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-stone-200 bg-white/60 px-4 py-8 text-sm leading-7 text-stone-500">
              还没有听写结果记录，或者你已经把当前账号下的记录删除完了。
            </div>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

export default function JourneyPage() {
  return (
    <Suspense fallback={<div className="rounded-[24px] border border-white/70 bg-white/70 px-4 py-6 text-sm text-stone-500">正在加载学习数据...</div>}>
      <JourneyContent />
    </Suspense>
  );
}
