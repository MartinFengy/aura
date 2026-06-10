"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CirclePause,
  CircleX,
  Eye,
  Headphones,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Volume2,
} from "lucide-react";
import { GlassCard } from "@/components/aura/glass-card";
import { useLearningTasks } from "@/hooks/use-learning-tasks";
import { getRecognitionEntryQuality } from "@/lib/recognition-quality";
import type { DictationMode, DictationResult } from "@/lib/learning-store";
import { speakSequence, speakText, stopSpeaking } from "@/lib/speech";

type ScopedEntry = ReturnType<typeof buildScopedEntries>[number];

function buildScopedEntries(taskIds: string[], tasks: ReturnType<typeof useLearningTasks>["tasks"]) {
  return tasks
    .filter((task) => taskIds.includes(task.id))
    .flatMap((task) => task.entries.map((entry) => ({ ...entry, taskId: task.id, taskName: task.name })));
}

export default function LexiconPage() {
  const {
    tasks,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    renameTask,
    deleteTask,
    deleteEntry,
    practiceHistory,
    recordDictationSession,
  } = useLearningTasks();

  const [editingTaskId, setEditingTaskId] = useState("");
  const [taskNameDraft, setTaskNameDraft] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [scopeAllTasks, setScopeAllTasks] = useState(false);
  const [entriesExpanded, setEntriesExpanded] = useState(true);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [entryPageSize, setEntryPageSize] = useState(8);
  const [entryPage, setEntryPage] = useState(1);

  const [dictationCount, setDictationCount] = useState(10);
  const [dictationCountDraft, setDictationCountDraft] = useState("10");
  const [isEditingDictationCount, setIsEditingDictationCount] = useState(false);
  const [repeatCount, setRepeatCount] = useState(2);
  const [repeatCountDraft, setRepeatCountDraft] = useState("2");
  const [isEditingRepeatCount, setIsEditingRepeatCount] = useState(false);
  const [dictationMode, setDictationMode] = useState<DictationMode>("词条听写");
  const [autoPlay, setAutoPlay] = useState(true);
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [continuousRange, setContinuousRange] = useState(true);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(10);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [lastResult, setLastResult] = useState("未开始");
  const [sessionFinished, setSessionFinished] = useState(false);
  const [dictationStarted, setDictationStarted] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<
    Array<{
      entryId: string;
      taskId: string;
      vocabulary: string;
      chinese: string;
      sentence: string;
      example: string;
      pronunciation: string;
      result: DictationResult;
    }>
  >([]);

  const activeTaskIds = useMemo(() => {
    const validIds = selectedTaskIds.filter((taskId) => tasks.some((task) => task.id === taskId));
    if (scopeAllTasks) {
      return tasks.map((task) => task.id);
    }
    if (validIds.length > 0) {
      return validIds;
    }
    if (selectedTaskId && tasks.some((task) => task.id === selectedTaskId)) {
      return [selectedTaskId];
    }
    return tasks[0] ? [tasks[0].id] : [];
  }, [scopeAllTasks, selectedTaskIds, selectedTaskId, tasks]);

  const scopeTaskNames = useMemo(
    () => tasks.filter((task) => activeTaskIds.includes(task.id)).map((task) => task.name),
    [activeTaskIds, tasks],
  );

  const latestSelectedTaskResult = useMemo(() => {
    if (!selectedTask) {
      return "未开始";
    }

    const latestSession = practiceHistory.find((session) =>
      session.taskIds.includes(selectedTask.id),
    );
    if (!latestSession) {
      return "未开始";
    }

    return `错题 ${latestSession.wrongCount} · 模糊 ${latestSession.fuzzyCount}`;
  }, [practiceHistory, selectedTask]);

  const entries = useMemo(() => selectedTask?.entries ?? [], [selectedTask]);
  const entryTotalPages = Math.max(1, Math.ceil(entries.length / entryPageSize));
  const safeEntryPage = Math.min(entryPage, entryTotalPages);
  const pagedEntries = useMemo(
    () => entries.slice((safeEntryPage - 1) * entryPageSize, safeEntryPage * entryPageSize),
    [entries, entryPageSize, safeEntryPage],
  );

  const mergedScopeEntries = useMemo(
    () => buildScopedEntries(activeTaskIds, tasks),
    [activeTaskIds, tasks],
  );
  const maxRange = Math.max(mergedScopeEntries.length, 1);
  const safeRangeStart = Math.min(Math.max(rangeStart, 1), maxRange);
  const safeRangeEnd = Math.min(Math.max(rangeEnd, safeRangeStart), maxRange);
  const rangeEntries = continuousRange
    ? mergedScopeEntries.slice(safeRangeStart - 1, safeRangeEnd)
    : mergedScopeEntries;
  const orderedEntries = useMemo(() => {
    if (!shuffleOrder) {
      return rangeEntries;
    }

    return [...rangeEntries].sort((left, right) =>
      `${left.taskId}-${left.id}`.localeCompare(`${right.taskId}-${right.id}`) * (left.id > right.id ? -1 : 1),
    );
  }, [rangeEntries, shuffleOrder]);
  const scopedEntries = orderedEntries.slice(0, dictationCount);

  const totalQuestions = Math.max(scopedEntries.length, 1);
  const safeQuestionIndex =
    scopedEntries.length === 0 ? 0 : Math.min(questionIndex, scopedEntries.length - 1);
  const currentEntry = scopedEntries[safeQuestionIndex] ?? null;
  const progress = `${Math.round((Math.min(safeQuestionIndex + 1, totalQuestions) / totalQuestions) * 100)}%`;
  const sessionSummary = useMemo(() => {
    const correctCount = sessionAnswers.filter((answer) => answer.result === "认识").length;
    const fuzzyCount = sessionAnswers.filter((answer) => answer.result === "模糊").length;
    const wrongCount = sessionAnswers.filter((answer) => answer.result === "不认识").length;
    const answeredCount = sessionAnswers.length;
    const score = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    return {
      correctCount,
      fuzzyCount,
      wrongCount,
      answeredCount,
      score,
    };
  }, [sessionAnswers]);

  useEffect(() => {
    if (!dictationStarted || !autoPlay || !currentEntry || sessionFinished) {
      return;
    }

    const timer = window.setTimeout(() => {
      playPrompt(currentEntry, dictationMode, repeatCount);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [
    autoPlay,
    currentEntry,
    dictationMode,
    dictationStarted,
    repeatCount,
    safeQuestionIndex,
    sessionFinished,
  ]);

  function toggleTaskScope(taskId: string) {
    setScopeAllTasks(false);
    setSelectedTaskIds((current) => {
      const validIds = current.filter((id) => tasks.some((task) => task.id === id));
      const baseIds =
        validIds.length > 0
          ? validIds
          : selectedTaskId && tasks.some((task) => task.id === selectedTaskId)
            ? [selectedTaskId]
            : tasks[0]
              ? [tasks[0].id]
              : [];

      if (baseIds.includes(taskId)) {
        const nextIds = baseIds.filter((id) => id !== taskId);
        if (nextIds.length > 0) {
          return nextIds;
        }
        return selectedTaskId ? [selectedTaskId] : baseIds;
      }

      return [...baseIds, taskId];
    });
    resetDictationState();
  }

  function resetDictationState(nextResult = "未开始") {
    setQuestionIndex(0);
    setShowAnswer(false);
    setSessionFinished(false);
    setSessionAnswers([]);
    setLastResult(nextResult);
    setDictationStarted(false);
    stopSpeaking();
  }

  function startDictation() {
    if (!scopedEntries.length) {
      return;
    }

    setQuestionIndex(0);
    setShowAnswer(false);
    setSessionFinished(false);
    setSessionAnswers([]);
    setLastResult("进行中");
    setDictationStarted(true);
    window.setTimeout(() => {
      playPrompt(scopedEntries[0], dictationMode, repeatCount);
    }, 120);
  }

  function restartDictation() {
    resetDictationState("重新开始");
    setDictationStarted(true);
    window.setTimeout(() => {
      if (scopedEntries[0]) {
        playPrompt(scopedEntries[0], dictationMode, repeatCount);
      }
    }, 120);
  }

  function startRename(taskId: string, currentName: string) {
    setEditingTaskId(taskId);
    setTaskNameDraft(currentName);
  }

  function submitRename() {
    if (!editingTaskId || !taskNameDraft.trim()) {
      return;
    }

    renameTask(editingTaskId, taskNameDraft.trim());
    setEditingTaskId("");
    setTaskNameDraft("");
  }

  function confirmDeleteTask(taskId: string, taskName: string) {
    if (typeof window !== "undefined") {
      const shouldDelete = window.confirm(`确认删除任务「${taskName}」吗？删除后该任务下的词条也会一起移除。`);
      if (!shouldDelete) {
        return;
      }
    }

    deleteTask(taskId);
  }

  function confirmDeleteEntry(entryId: string, vocabulary: string) {
    if (typeof window !== "undefined") {
      const shouldDelete = window.confirm(`确认删除单词「${vocabulary}」吗？删除后无法恢复。`);
      if (!shouldDelete) {
        return;
      }
    }

    if (selectedTask) {
      deleteEntry({ taskId: selectedTask.id, entryId });
    }
  }

  function handleAnswer(result: DictationResult) {
    if (!currentEntry) {
      return;
    }

    const answers = [
      ...sessionAnswers,
      {
        entryId: currentEntry.id,
        taskId: currentEntry.taskId,
        vocabulary: currentEntry.vocabulary,
        chinese: currentEntry.chinese,
        sentence: currentEntry.sentence,
        example: currentEntry.example,
        pronunciation: currentEntry.pronunciation,
        result,
      },
    ];

    setSessionAnswers(answers);
    setShowAnswer(false);

    const isLast = safeQuestionIndex + 1 >= scopedEntries.length;
    if (isLast) {
      const correctCount = answers.filter((answer) => answer.result === "认识").length;
      const fuzzyCount = answers.filter((answer) => answer.result === "模糊").length;
      const wrongCount = answers.filter((answer) => answer.result === "不认识").length;

      recordDictationSession({
        taskIds: activeTaskIds,
        taskNames: scopeTaskNames,
        totalQuestions: answers.length,
        repeatCount,
        mode: dictationMode,
        correctCount,
        fuzzyCount,
        wrongCount,
        answers,
      });

      setLastResult(`完成：正确 ${correctCount} · 模糊 ${fuzzyCount} · 错题 ${wrongCount}`);
      setSessionFinished(true);
      stopSpeaking();
      return;
    }

    setLastResult(result);
    setQuestionIndex((current) => current + 1);
  }

  function updateDictationCount(nextValue: number) {
    const safeNext = Math.max(1, Math.floor(nextValue || 1));
    if (continuousRange) {
      const targetEnd = Math.min(maxRange, safeRangeStart + safeNext - 1);
      setRangeEnd(targetEnd);
      const actualCount = Math.min(
        safeNext,
        Math.max(targetEnd - safeRangeStart + 1, 1),
      );
      setDictationCount(actualCount);
      setDictationCountDraft(String(actualCount));
    } else {
      const actualCount = Math.min(
        safeNext,
        Math.max(mergedScopeEntries.length, 1),
      );
      setDictationCount(actualCount);
      setDictationCountDraft(String(actualCount));
    }
    resetDictationState();
  }

  function updateRepeatCount(nextValue: number) {
    const actualCount = Math.max(1, Math.floor(nextValue || 1));
    setRepeatCount(actualCount);
    setRepeatCountDraft(String(actualCount));
    resetDictationState();
  }

  function commitDictationCountDraft() {
    const parsed = Number.parseInt(dictationCountDraft, 10);
    if (Number.isNaN(parsed)) {
      setDictationCountDraft(String(dictationCount));
      setIsEditingDictationCount(false);
      return;
    }
    updateDictationCount(parsed);
    setDictationCountDraft(String(Math.max(1, Math.floor(parsed))));
    setIsEditingDictationCount(false);
  }

  function commitRepeatCountDraft() {
    const parsed = Number.parseInt(repeatCountDraft, 10);
    if (Number.isNaN(parsed)) {
      setRepeatCountDraft(String(repeatCount));
      setIsEditingRepeatCount(false);
      return;
    }
    updateRepeatCount(parsed);
    setRepeatCountDraft(String(Math.max(1, Math.floor(parsed))));
    setIsEditingRepeatCount(false);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
            <Headphones className="h-4 w-4" />
            识别任务
          </div>
          <h3 className="mt-3 text-lg font-semibold text-stone-900 sm:text-2xl">任务库</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setScopeAllTasks(true);
                setSelectedTaskIds(tasks.map((task) => task.id));
                resetDictationState();
              }}
              className={`rounded-full px-3 py-1.5 text-xs ${
                scopeAllTasks
                  ? "bg-stone-900 text-white"
                  : "border border-stone-200 bg-white text-stone-700"
              }`}
            >
              全部任务
            </button>
            <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs text-stone-600">
              当前听写范围：{activeTaskIds.length} 个任务
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {tasks.map((task) => {
              const isActive = task.id === selectedTaskId;
              const inScope = activeTaskIds.includes(task.id);

              return (
                <div
                  key={task.id}
                  className={`rounded-[24px] border px-4 py-4 transition ${
                    isActive
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-white/65 bg-white/70 text-stone-700 hover:bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setEntryPage(1);
                    }}
                    className="w-full text-left"
                  >
                    <p className="font-medium">{task.name}</p>
                    <p className={`mt-2 text-xs ${isActive ? "text-stone-300" : "text-stone-500"}`}>
                      {task.source} · {task.entries.length} 条词汇
                    </p>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTaskScope(task.id)}
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        inScope
                          ? isActive
                            ? "bg-white/20 text-white"
                            : "bg-stone-900 text-white"
                          : isActive
                            ? "border border-white/30 text-white"
                            : "border border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {inScope ? "已加入听写范围" : "加入听写范围"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(task.id, task.name)}
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "border border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeleteTask(task.id, task.name)}
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "border border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      删除任务
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {editingTaskId ? (
            <div className="mt-6 rounded-[24px] border border-white/70 bg-[#fffdfa] p-4">
              <div className="mb-2 text-sm font-medium text-stone-700">重命名任务</div>
              <input
                value={taskNameDraft}
                onChange={(event) => setTaskNameDraft(event.target.value)}
                className="w-full rounded-[18px] border border-white/70 bg-white px-3 py-3 text-sm text-stone-700 outline-none"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={submitRename}
                  className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
                >
                  保存名称
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTaskId("");
                    setTaskNameDraft("");
                  }}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
        </GlassCard>

        <div className="min-w-0 space-y-6">
          <GlassCard className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-stone-500">当前任务词条</p>
                <h2 className="mt-2 break-all text-[1.35rem] font-semibold leading-tight text-stone-900 sm:text-3xl">
                  {selectedTask?.name ?? "未选择任务"}
                </h2>
                <p className="mt-3 max-w-2xl text-[13px] leading-7 text-stone-600 sm:text-sm sm:leading-8">
                  当前任务可单独浏览、删除词条，也可以把多个任务组合成一次听写范围。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEntriesExpanded((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-[13px] text-stone-700 sm:text-sm"
              >
                {entriesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {entriesExpanded ? "收起识别结果" : "展开识别结果"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: "任务时间", value: selectedTask?.createdAt ?? "--" },
                { label: "词条数量", value: `${entries.length} 条` },
                { label: "最新结果", value: latestSelectedTaskResult },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[20px] border border-white/70 bg-white/80 px-3 py-3 sm:rounded-[22px] sm:px-4 sm:py-4"
                >
                  <p className="text-[11px] text-stone-500 sm:text-xs">{item.label}</p>
                  <p className="mt-1 text-[12px] font-medium leading-5 text-stone-800 sm:mt-2 sm:text-sm">{item.value}</p>
                </div>
              ))}
            </div>

            {entriesExpanded ? (
              <>
              <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-white/70 bg-[#fbf8f4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-stone-600 sm:gap-3 sm:text-sm">
                    <span>每页显示</span>
                    <select
                      value={entryPageSize}
                      onChange={(event) => {
                        setEntryPageSize(Number(event.target.value));
                        setEntryPage(1);
                      }}
                      className="rounded-full border border-white/70 bg-white px-3 py-2 text-xs text-stone-700 outline-none sm:text-sm"
                    >
                      {[8, 12, 16].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <span>
                      第 {safeEntryPage} / {entryTotalPages} 页
                    </span>
                    <span className="break-words">
                      当前显示 {pagedEntries.length} / {entries.length} 条
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEntryPage(Math.max(1, safeEntryPage - 1))}
                      disabled={safeEntryPage === 1}
                      className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-2 text-xs text-stone-700 disabled:opacity-40 sm:text-sm"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryPage(Math.min(entryTotalPages, safeEntryPage + 1))}
                      disabled={safeEntryPage === entryTotalPages}
                      className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-2 text-xs text-stone-700 disabled:opacity-40 sm:text-sm"
                    >
                      下一页
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 lg:grid-cols-2">
                  {pagedEntries.map((entry) => {
                    const quality = getRecognitionEntryQuality(entry);

                    return (
                    <div
                      key={entry.id}
                      className="min-w-0 rounded-[24px] border border-white/65 bg-white/70 px-4 py-4 text-stone-700"
                    >
                      <p className="break-words text-[clamp(1.02rem,3.8vw,1.35rem)] font-medium leading-snug text-stone-900 sm:text-[clamp(1.5rem,3vw,2rem)]">
                        {entry.vocabulary}
                      </p>
                      <p className="mt-2 text-[12px] leading-5 text-stone-500 sm:text-sm sm:leading-6">
                        {quality.invalidChinese ? "中文释义未通过质检，请重新识别或删除该词条。" : entry.chinese}
                      </p>
                      <p className="mt-2 break-words text-[12px] leading-5 text-stone-600 sm:text-sm sm:leading-6">
                        {quality.invalidExample ? "例句未通过质检，请重新识别或删除该词条。" : entry.example}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => speakText(entry.vocabulary)}
                          className="inline-flex min-w-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] text-stone-700 sm:gap-2 sm:px-3 sm:text-xs"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          播放词条
                        </button>
                        <button
                          type="button"
                          onClick={() => speakText(entry.example)}
                          disabled={quality.invalidExample}
                          className="inline-flex min-w-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] text-stone-700 sm:gap-2 sm:px-3 sm:text-xs"
                        >
                          <Play className="h-3.5 w-3.5" />
                          播放例句
                        </button>
                        {selectedTask ? (
                          <button
                            type="button"
                            onClick={() => confirmDeleteEntry(entry.id, entry.vocabulary)}
                            className="inline-flex min-w-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] text-stone-700 sm:gap-2 sm:px-3 sm:text-xs"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除单词
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )})}
                </div>
              </>
            ) : null}
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setConfigExpanded((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
                <SlidersHorizontal className="h-4 w-4" />
                听写规则配置
              </div>
              {configExpanded ? (
                <ChevronUp className="h-4 w-4 text-stone-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-stone-500" />
              )}
            </button>

            {configExpanded ? (
              <>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="text-sm text-stone-500">听写数量</p>
                <input
                  type="text"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(mergedScopeEntries.length, 1)}
                  value={isEditingDictationCount ? dictationCountDraft : String(dictationCount)}
                  onFocus={() => setIsEditingDictationCount(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/[^\d]/g, "");
                    setDictationCountDraft(nextValue);
                  }}
                  onBlur={commitDictationCountDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitDictationCountDraft();
                    }
                  }}
                  className="mt-2 w-full rounded-[16px] border border-white/70 bg-[#fbf8f4] px-3 py-2 text-sm text-stone-700 outline-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[5, 10, 15, 20, 30].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        updateDictationCount(count);
                        setDictationCountDraft(String(Math.min(count, Math.max(mergedScopeEntries.length, 1))));
                        setIsEditingDictationCount(false);
                      }}
                      className={`rounded-full px-3 py-1 text-xs ${
                        dictationCount === Math.min(count, Math.max(mergedScopeEntries.length, 1))
                          ? "bg-stone-900 text-white"
                          : "border border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {count} 个
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  可自定义输入，当前最多 {Math.max(mergedScopeEntries.length, 1)} 个
                </p>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="text-sm text-stone-500">重复次数</p>
                <input
                  type="text"
                  inputMode="numeric"
                  min={1}
                  value={isEditingRepeatCount ? repeatCountDraft : String(repeatCount)}
                  onFocus={() => setIsEditingRepeatCount(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/[^\d]/g, "");
                    setRepeatCountDraft(nextValue);
                  }}
                  onBlur={commitRepeatCountDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitRepeatCountDraft();
                    }
                  }}
                  className="mt-2 w-full rounded-[16px] border border-white/70 bg-[#fbf8f4] px-3 py-2 text-sm text-stone-700 outline-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        updateRepeatCount(count);
                        setRepeatCountDraft(String(count));
                        setIsEditingRepeatCount(false);
                      }}
                      className={`rounded-full px-3 py-1 text-xs ${
                        repeatCount === count
                          ? "bg-stone-900 text-white"
                          : "border border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {count} 次
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="text-sm text-stone-500">听写模式</p>
                <select
                  value={dictationMode}
                  onChange={(event) => {
                    setDictationMode(event.target.value as DictationMode);
                    resetDictationState();
                  }}
                  className="mt-2 w-full rounded-[16px] border border-white/70 bg-[#fbf8f4] px-3 py-2 text-sm text-stone-700 outline-none"
                >
                  <option value="词条听写">单词/短语</option>
                  <option value="例句听写">例句</option>
                  <option value="中文听写">中文意思</option>
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/70 bg-[#fffdfa] px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-stone-700">听写范围</p>
                <button
                  type="button"
                  onClick={() => {
                    setContinuousRange(true);
                    resetDictationState();
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    continuousRange
                      ? "bg-stone-900 text-white"
                      : "border border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  连续范围
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContinuousRange(false);
                    resetDictationState();
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    !continuousRange
                      ? "bg-stone-900 text-white"
                      : "border border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  所有已选任务
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-stone-700">顺序设置</p>
                <button
                  type="button"
                  onClick={() => {
                    setShuffleOrder(false);
                    resetDictationState();
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    !shuffleOrder
                      ? "bg-stone-900 text-white"
                      : "border border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  原顺序
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShuffleOrder(true);
                    resetDictationState();
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    shuffleOrder
                      ? "bg-stone-900 text-white"
                      : "border border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  打乱顺序
                </button>
              </div>

              {continuousRange ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-stone-500">起始条目</p>
                    <input
                      type="number"
                      min={1}
                      max={maxRange}
                      value={rangeStart}
                      onChange={(event) => {
                        setRangeStart(Number(event.target.value) || 1);
                        resetDictationState();
                      }}
                      className="mt-2 w-full rounded-[16px] border border-white/70 bg-white px-3 py-3 text-sm text-stone-700 outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">结束条目</p>
                    <input
                      type="number"
                      min={1}
                      max={maxRange}
                      value={rangeEnd}
                      onChange={(event) => {
                        setRangeEnd(Number(event.target.value) || 1);
                        resetDictationState();
                      }}
                      className="mt-2 w-full rounded-[16px] border border-white/70 bg-white px-3 py-3 text-sm text-stone-700 outline-none"
                    />
                  </div>
                  <p className="text-sm text-stone-500 md:col-span-2">
                    范围：1 - {maxRange}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-stone-600">
                  当前将从已选中的 {activeTaskIds.length} 个任务里组合抽取听写内容。
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="text-sm text-stone-500">自动播放</p>
                <button
                  type="button"
                  onClick={() => setAutoPlay((current) => !current)}
                  className="mt-2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
                >
                  {autoPlay ? "已开启" : "已关闭"}
                </button>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="text-sm text-stone-500">本次题量</p>
                <p className="mt-2 text-lg font-semibold text-stone-900">{scopedEntries.length} 题</p>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="text-sm text-stone-500">最近结果</p>
                <p className="mt-2 text-lg font-semibold text-stone-900">{lastResult}</p>
              </div>
              <button
                type="button"
                onClick={dictationStarted ? restartDictation : startDictation}
                className="rounded-[22px] border border-stone-900 bg-stone-900 px-4 py-4 text-left text-white"
              >
                <div className="flex items-center gap-2 text-sm text-stone-300">
                  {dictationStarted ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {dictationStarted ? "重新听写" : "开始听写"}
                </div>
                <p className="mt-2 text-lg font-semibold">
                  {dictationStarted ? "从第 1 题重新开始" : "点击后开始自动播放"}
                </p>
              </button>
            </div>
              </>
            ) : null}
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                  <h3 className="text-2xl font-semibold text-stone-900 sm:text-3xl">听写进行中</h3>
                  <p className="mt-2 text-base text-stone-500 sm:text-xl">
                    当前第 {Math.min(safeQuestionIndex + 1, totalQuestions)} 题 / 共 {totalQuestions} 题
                  </p>
                </div>
              <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => playPrompt(currentEntry, dictationMode, repeatCount)}
                    className="inline-flex flex-col items-center justify-center gap-2 rounded-[18px] border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800 shadow-sm sm:flex-row sm:px-5"
                  >
                    <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
                    重读
                  </button>
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="inline-flex flex-col items-center justify-center gap-2 rounded-[18px] border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800 shadow-sm sm:flex-row sm:px-5"
                  >
                    <CirclePause className="h-4 w-4 sm:h-5 sm:w-5" />
                    暂停
                  </button>
                  <button
                    type="button"
                    onClick={() => currentEntry && speakText(currentEntry.sentence)}
                    className="inline-flex flex-col items-center justify-center gap-2 rounded-[18px] border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800 shadow-sm sm:flex-row sm:px-5"
                  >
                    <Headphones className="h-4 w-4 sm:h-5 sm:w-5" />
                    原句发音
                  </button>
                </div>
              </div>

              <div className="h-4 rounded-full bg-stone-200">
                <div className="h-4 rounded-full bg-stone-900" style={{ width: progress }} />
              </div>

              <div className="rounded-[32px] border border-stone-100 bg-[#fbfbfb] px-6 py-10 text-center">
                <div className="mx-auto flex max-w-[820px] flex-col items-center gap-5">
                  {sessionFinished ? (
                    <div className="w-full rounded-[28px] bg-[#f5efe8] px-5 py-6 text-left">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Session Complete</p>
                          <h4 className="mt-2 text-2xl font-semibold text-stone-900 sm:text-3xl">本次听写已完成</h4>
                          <p className="mt-2 text-base text-stone-600 sm:text-lg">
                            共作答 {sessionSummary.answeredCount} 题，得分 {sessionSummary.score} 分
                          </p>
                        </div>
                        <div className="rounded-[24px] bg-stone-900 px-5 py-4 text-white">
                          <p className="text-sm text-stone-300">正确率</p>
                          <p className="mt-1 text-2xl font-semibold sm:text-3xl">{sessionSummary.score}%</p>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[20px] bg-[#d8f2df] px-4 py-4">
                          <p className="text-sm text-stone-600">掌握</p>
                          <p className="mt-2 text-xl font-semibold text-stone-900 sm:text-2xl">{sessionSummary.correctCount}</p>
                        </div>
                        <div className="rounded-[20px] bg-[#fff1bf] px-4 py-4">
                          <p className="text-sm text-stone-600">模糊</p>
                          <p className="mt-2 text-xl font-semibold text-stone-900 sm:text-2xl">{sessionSummary.fuzzyCount}</p>
                        </div>
                        <div className="rounded-[20px] bg-[#ffd7d7] px-4 py-4">
                          <p className="text-sm text-stone-600">不认识</p>
                          <p className="mt-2 text-xl font-semibold text-stone-900 sm:text-2xl">{sessionSummary.wrongCount}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-5xl text-stone-400">🔊</p>
                      <p className="text-2xl leading-tight text-stone-500 sm:text-4xl">
                        {dictationStarted ? "请听发音后作答" : "点击开始听写后开始播放"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAnswer((current) => !current)}
                        disabled={!dictationStarted}
                        className="inline-flex items-center gap-2 rounded-[18px] border border-stone-200 bg-white px-5 py-3 text-lg font-medium text-stone-900 shadow-sm sm:text-2xl"
                      >
                        <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
                        {showAnswer ? "隐藏答案" : "显示答案"}
                      </button>

                      {showAnswer && currentEntry ? (
                        <div className="w-full rounded-[24px] bg-[#f5efe8] px-5 py-5 text-left">
                          {(() => {
                            const quality = getRecognitionEntryQuality(currentEntry);

                            return (
                            <>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xl font-semibold text-stone-900 sm:text-2xl">
                              {currentEntry.vocabulary}
                            </p>
                            <button
                              type="button"
                              onClick={() => speakText(currentEntry.vocabulary)}
                              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"
                            >
                              <Volume2 className="h-4 w-4" />
                              播放词条
                            </button>
                            <button
                              type="button"
                              onClick={() => speakText(currentEntry.example)}
                              disabled={quality.invalidExample}
                              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"
                            >
                              <Play className="h-4 w-4" />
                              播放例句
                            </button>
                            <button
                              type="button"
                              onClick={() => speakText(currentEntry.sentence)}
                              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"
                            >
                              <Headphones className="h-4 w-4" />
                              播放原句
                            </button>
                          </div>
                          <p className="mt-2 text-base text-stone-600 sm:text-lg">
                            {quality.invalidChinese ? "中文释义未通过质检，请重新识别或删除该词条。" : currentEntry.chinese}
                          </p>
                          <p className="mt-4 text-sm leading-7 text-stone-700 sm:text-base">{currentEntry.sentence}</p>
                          <p className="mt-4 text-sm leading-7 text-stone-700 sm:text-base">
                            {quality.invalidExample ? "例句未通过质检，请重新识别或删除该词条。" : currentEntry.example}
                          </p>
                            </>
                            );
                          })()}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => handleAnswer("认识")}
                  disabled={!dictationStarted || !currentEntry || sessionFinished}
                  className="inline-flex items-center justify-center gap-3 rounded-[18px] bg-[#09a63e] px-6 py-4 text-xl font-semibold text-white disabled:opacity-50 sm:px-8 sm:text-2xl"
                >
                  <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7" />
                  认识
                </button>
                <button
                  type="button"
                  onClick={() => handleAnswer("模糊")}
                  disabled={!dictationStarted || !currentEntry || sessionFinished}
                  className="inline-flex items-center justify-center gap-3 rounded-[18px] bg-[#f4b500] px-6 py-4 text-xl font-semibold text-white disabled:opacity-50 sm:px-8 sm:text-2xl"
                >
                  <Play className="h-6 w-6 sm:h-7 sm:w-7" />
                  模糊
                </button>
                <button
                  type="button"
                  onClick={() => handleAnswer("不认识")}
                  disabled={!dictationStarted || !currentEntry || sessionFinished}
                  className="inline-flex items-center justify-center gap-3 rounded-[18px] bg-[#ef2323] px-6 py-4 text-xl font-semibold text-white disabled:opacity-50 sm:px-8 sm:text-2xl"
                >
                  <CircleX className="h-6 w-6 sm:h-7 sm:w-7" />
                  不认识
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function playPrompt(
  entry: null | ScopedEntry,
  mode: DictationMode,
  repeatCount: number,
) {
  if (!entry) {
    return;
  }

  const prompt =
    mode === "例句听写"
      ? entry.example
      : mode === "中文听写"
        ? entry.chinese
        : entry.vocabulary;
  const texts = Array.from({ length: Math.max(repeatCount, 1) }, () => prompt);
  speakSequence(texts, 420);
}
