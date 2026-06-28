"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Languages,
  Link2,
  ListMusic,
  Mic2,
  ScanSearch,
  Sparkles,
  Volume2,
} from "lucide-react";
import { GlassCard } from "@/components/aura/glass-card";
import { LearningWorkspace } from "@/components/aura/learning-workspace";
import { useAuraConfig } from "@/hooks/use-aura-config";
import { useLearningTasks } from "@/hooks/use-learning-tasks";
import {
  getRecognitionEntryQuality,
  isLowQualityChineseMeaning,
  isLowQualityTranslation,
} from "@/lib/recognition-quality";
import { speakText } from "@/lib/speech";

function normalizeSentenceForDisplayOrder(value: string) {
  return value
    .replace(/[“”‘’"']/g, "")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findEntryReadingPosition(rawText: string, sentence: string, vocabulary: string) {
  const normalizedRawText = normalizeSentenceForDisplayOrder(rawText);
  const normalizedSentence = normalizeSentenceForDisplayOrder(sentence);
  const normalizedVocabulary = normalizeSentenceForDisplayOrder(vocabulary);

  const sentenceIndex =
    normalizedSentence.length > 0
      ? normalizedRawText.indexOf(normalizedSentence)
      : -1;
  const vocabularyIndex =
    normalizedVocabulary.length > 0
      ? normalizedRawText.indexOf(normalizedVocabulary)
      : -1;

  return {
    sentenceIndex: sentenceIndex >= 0 ? sentenceIndex : Number.MAX_SAFE_INTEGER,
    vocabularyIndex:
      vocabularyIndex >= 0 ? vocabularyIndex : Number.MAX_SAFE_INTEGER,
  };
}

function sortEntriesByReadingOrder<T extends { sentence: string; vocabulary: string }>(
  rawText: string,
  entries: T[],
) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftPosition = findEntryReadingPosition(
        rawText,
        left.entry.sentence,
        left.entry.vocabulary,
      );
      const rightPosition = findEntryReadingPosition(
        rawText,
        right.entry.sentence,
        right.entry.vocabulary,
      );

      if (leftPosition.sentenceIndex !== rightPosition.sentenceIndex) {
        return leftPosition.sentenceIndex - rightPosition.sentenceIndex;
      }

      if (leftPosition.vocabularyIndex !== rightPosition.vocabularyIndex) {
        return leftPosition.vocabularyIndex - rightPosition.vocabularyIndex;
      }

      return left.index - right.index;
    })
    .map((item) => item.entry);
}

function stopEntryActionEvent(event: {
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  event.preventDefault();
  event.stopPropagation();
}

function resolveDisplayChinese(entry: {
  vocabulary: string;
  chinese: string;
  partOfSpeech?: string;
  sentenceChinese?: string;
  exampleChinese?: string;
}) {
  if (!isLowQualityChineseMeaning(entry.vocabulary, entry.chinese)) {
    return entry.chinese;
  }

  if (entry.sentenceChinese?.trim()) {
    return entry.sentenceChinese.trim();
  }

  if (entry.exampleChinese?.trim()) {
    return entry.exampleChinese.trim();
  }

  if (entry.chinese?.trim()) {
    return entry.chinese.trim();
  }

  const partOfSpeech = entry.partOfSpeech?.toLowerCase() ?? "";
  if (partOfSpeech.includes("proper")) {
    return "专有名词";
  }
  if (partOfSpeech.includes("verb")) {
    return "动词表达";
  }
  if (partOfSpeech.includes("noun")) {
    return "名词性表达";
  }
  if (partOfSpeech.includes("adjective")) {
    return "形容词表达";
  }

  return "固定表达";
}

function resolveSentenceChinese(entry: { sentenceChinese?: string }) {
  return entry.sentenceChinese?.trim() || "原句翻译待补充";
}

function resolveExample(entry: { example?: string }) {
  return entry.example?.trim() || "例句待补充";
}

function resolveExampleChinese(entry: { exampleChinese?: string }) {
  return entry.exampleChinese?.trim() || "例句翻译待补充";
}

export default function ReadingPage() {
  const { selectedTask, tasks, deleteEntry, replaceTaskEntries } = useLearningTasks();
  const { config } = useAuraConfig();
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [syncMessage, setSyncMessage] = useState("");
  const [permissionUrl, setPermissionUrl] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const repairingTaskIdsRef = useRef<Set<string>>(new Set());
  const entries = useMemo(
    () =>
      sortEntriesByReadingOrder(selectedTask?.rawText ?? "", [
        ...(selectedTask?.entries ?? []),
        ...(selectedTask?.properNouns ?? []),
      ]),
    [selectedTask],
  );

  useEffect(() => {
    setPage(1);
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!selectedTask || repairingTaskIdsRef.current.has(selectedTask.id)) {
      return;
    }

    const currentTaskId = selectedTask.id;

    const needsChineseRepair = [...(selectedTask.entries ?? []), ...(selectedTask.properNouns ?? [])].some(
      (entry) =>
        isLowQualityChineseMeaning(entry.vocabulary, entry.chinese) ||
        isLowQualityTranslation(entry.sentenceChinese ?? "") ||
        isLowQualityTranslation(entry.exampleChinese ?? ""),
    );

    if (!needsChineseRepair || !selectedTask.rawText?.trim()) {
      return;
    }

    repairingTaskIdsRef.current.add(selectedTask.id);

    const formData = new FormData();
    formData.append("instructions", "请补全当前词条的中文意思、原句翻译、例句和例句翻译，保持原 sentence 和 vocabulary 不变。");
    formData.append("feishuLink", config.feishuLink);
    formData.append("arkBaseUrl", config.arkBaseUrl);
    formData.append("arkModel", config.arkModel);
    formData.append("existingRawText", selectedTask.rawText);
    formData.append(
      "existingEntries",
      JSON.stringify([...(selectedTask.entries ?? []), ...(selectedTask.properNouns ?? [])]),
    );
    formData.append("sourceFileName", selectedTask.name);
    formData.append("stage2Enrich", "1");

    void (async () => {
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as {
          error?: string;
          rawText?: string;
          cleanedText?: string;
          entries?: typeof selectedTask.entries;
          properNouns?: typeof selectedTask.properNouns;
        };

        if (!response.ok || payload.error) {
          return;
        }

        replaceTaskEntries({
          taskId: currentTaskId,
          rawText: payload.rawText ?? payload.cleanedText ?? selectedTask.rawText,
          entries: payload.entries ?? selectedTask.entries,
          properNouns: payload.properNouns ?? selectedTask.properNouns ?? [],
          keepCurrentSelection: true,
        });
      } catch {
      } finally {
        repairingTaskIdsRef.current.delete(currentTaskId);
      }
    })();
  }, [config.arkBaseUrl, config.arkModel, config.feishuLink, replaceTaskEntries, selectedTask]);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedEntries = useMemo(
    () => entries.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, entries, pageSize],
  );

  function confirmDeleteEntry(entryId: string, vocabulary: string) {
    if (typeof window !== "undefined") {
      const shouldDelete = window.confirm(`确认删除词条「${vocabulary}」吗？删除后无法恢复。`);
      if (!shouldDelete) {
        return;
      }
    }

    if (selectedTask) {
      deleteEntry({ taskId: selectedTask.id, entryId });
    }
  }

  async function syncToFeishu() {
    if (!selectedTask || entries.length === 0) {
      setSyncMessage("当前任务没有可同步的词条。");
      return;
    }

    try {
      const targetLink = selectedTask.feishuLink ?? config.feishuLink;
      setIsSyncing(true);
      setPermissionUrl("");
      setSyncMessage("正在同步到飞书多维表格...");
      const response = await fetch("/api/feishu/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          link: targetLink,
          taskName: selectedTask.name,
          entries,
        }),
      });
      const payload = (await response.json()) as {
        count?: number;
        error?: string;
        permissionUrl?: string;
      };
      if (!response.ok || payload.error) {
        setPermissionUrl(payload.permissionUrl ?? "");
        throw new Error(payload.error || "同步失败");
      }
      setSyncMessage(`飞书同步完成，已写入 ${payload.count ?? entries.length} 条记录。`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "飞书同步失败。");
    } finally {
      setIsSyncing(false);
    }
  }

  function openFeishuLink() {
    const targetLink = selectedTask?.feishuLink ?? config.feishuLink;
    if (typeof window !== "undefined") {
      window.open(targetLink, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="space-y-6">
      <LearningWorkspace />

      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-500">
              <ScanSearch className="h-4 w-4" />
              识别结果表
            </div>
            <h3 className="mt-3 break-words text-lg font-semibold text-stone-900 sm:text-2xl">
              {selectedTask?.name ?? "当前识别任务"}
            </h3>
            <p className="mt-2 text-[13px] leading-6 text-stone-600 sm:text-sm sm:leading-7">
              已识别 {entries.length} 条词汇与短语，包含学习词汇、固定搭配、人名、地名与其他高价值表达，支持完整句子、中文意思、句子翻译、例句和发音试听。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "识别任务", value: `${tasks.length} 个`, icon: Sparkles },
              { label: "当前词条", value: `${entries.length} 条`, icon: Languages },
              { label: "发音片段", value: `${entries.length * 3} 段`, icon: AudioLines },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-[22px] border border-white/70 bg-white/75 px-3 py-3 sm:rounded-[24px] sm:px-4 sm:py-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-stone-500 sm:text-sm">{label}</p>
                  <Icon className="h-4 w-4 text-stone-700" />
                </div>
                <p className="mt-2 text-lg font-semibold text-stone-900 sm:mt-3 sm:text-2xl">{value}</p>
              </div>
            ))}
            <button
              type="button"
              onClick={syncToFeishu}
              disabled={isSyncing}
              className="rounded-[22px] border border-stone-900 bg-stone-900 px-3 py-3 text-left text-white disabled:opacity-70 sm:rounded-[24px] sm:px-4 sm:py-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-stone-300 sm:text-sm">飞书同步</p>
                <Link2 className="h-4 w-4" />
              </div>
              <p className="mt-2 text-sm font-semibold sm:mt-3 sm:text-lg">
                {isSyncing ? "同步中..." : "同步飞书文档"}
              </p>
            </button>
            <button
              type="button"
              onClick={openFeishuLink}
              className="rounded-[22px] border border-white/70 bg-white/80 px-3 py-3 text-left text-stone-900 sm:rounded-[24px] sm:px-4 sm:py-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-stone-500 sm:text-sm">飞书链接</p>
                <Link2 className="h-4 w-4" />
              </div>
              <p className="mt-2 text-sm font-semibold sm:mt-3 sm:text-lg">打开飞书文档</p>
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-white/70 bg-[#fbf8f4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <span>每页显示</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-full border border-white/70 bg-white px-3 py-2 text-sm text-stone-700 outline-none"
            >
              {[10, 20, 30].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>
              第 {currentPage} / {totalPages} 页
            </span>
            <span>
              当前显示 {pagedEntries.length} / {entries.length} 条
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-40"
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {syncMessage ? (
          <div className="mt-4 rounded-[20px] border border-white/70 bg-white/85 px-4 py-3 text-sm text-stone-700">
            <p>{syncMessage}</p>
            {permissionUrl ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => window.open(permissionUrl, "_blank", "noopener,noreferrer")}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  前往开通飞书权限
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 space-y-3 md:hidden">
          {pagedEntries.map((entry) => {
            const quality = getRecognitionEntryQuality(entry);

            return (
              <div
                key={entry.id}
                className="rounded-[24px] border border-white/70 bg-white/85 px-4 py-4"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <div className="rounded-full bg-[#f3eadf] px-3 py-1.5 text-sm font-medium text-stone-900">
                    {entry.vocabulary}
                  </div>
                  {entry.partOfSpeech ? (
                    <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] text-stone-600">
                      {entry.partOfSpeech}
                    </div>
                  ) : null}
                  {entry.difficulty ? (
                    <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] text-stone-600">
                      {entry.difficulty}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => speakText(entry.vocabulary)}
                    className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1.5 text-[11px] text-white"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    词条发音
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-700">{entry.sentence}</p>
                <button
                  type="button"
                  onClick={() => speakText(entry.sentence)}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] text-stone-700"
                >
                  <Languages className="h-3.5 w-3.5" />
                  原句发音
                </button>
                <div className="mt-4 rounded-[18px] bg-[#fbf8f4] px-3 py-3">
                  <p className="text-[11px] text-stone-500">中文意思</p>
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {resolveDisplayChinese(entry)}
                  </p>
                </div>
                <div className="mt-3 rounded-[18px] bg-[#fbf8f4] px-3 py-3">
                  <p className="text-[11px] text-stone-500">原句翻译</p>
                  <p className="mt-1 text-sm leading-6 text-stone-700">{resolveSentenceChinese(entry)}</p>
                </div>
                <div className="mt-3 rounded-[18px] bg-[#fbf8f4] px-3 py-3">
                  <p className="text-[11px] text-stone-500">例句</p>
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {resolveExample(entry)}
                  </p>
                </div>
                <div className="mt-3 rounded-[18px] bg-[#fbf8f4] px-3 py-3">
                  <p className="text-[11px] text-stone-500">例句翻译</p>
                  <p className="mt-1 text-sm leading-6 text-stone-700">{resolveExampleChinese(entry)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => speakText(entry.example)}
                    disabled={!entry.example}
                    className="inline-flex items-center gap-1 rounded-full bg-[#f3eadf] px-3 py-1.5 text-[11px] text-stone-800 disabled:opacity-40"
                  >
                    <Mic2 className="h-3.5 w-3.5" />
                    例句发音
                  </button>
                  {selectedTask ? (
                  <button
                    type="button"
                    onPointerDown={stopEntryActionEvent}
                    onMouseDown={stopEntryActionEvent}
                    onTouchStart={stopEntryActionEvent}
                    onClick={(event) => {
                      stopEntryActionEvent(event);
                      confirmDeleteEntry(entry.id, entry.vocabulary);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] text-stone-700"
                  >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除词条
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 hidden overflow-hidden rounded-[28px] border border-white/70 bg-white/80 md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-stone-200/70 bg-[#f7f1ea] text-sm text-stone-500">
                <tr>
                  <th className="px-4 py-4 font-medium">完整句子</th>
                  <th className="px-4 py-4 font-medium">单词/短语</th>
                  <th className="px-4 py-4 font-medium">中文与翻译</th>
                  <th className="px-4 py-4 font-medium">例句与翻译</th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => {
                  const quality = getRecognitionEntryQuality(entry);

                  return (
                  <tr key={entry.id} className="border-b border-stone-100 last:border-b-0">
                    <td className="px-4 py-4 align-top text-sm leading-7 text-stone-700">
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="max-w-[520px]">{entry.sentence}</span>
                        <button
                          type="button"
                          onClick={() => speakText(entry.sentence)}
                          className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700"
                        >
                          <Languages className="h-3.5 w-3.5" />
                          原句发音
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[#f3eadf] px-3 py-2 text-sm font-medium text-stone-800">
                          <ListMusic className="h-4 w-4" />
                          {entry.vocabulary}
                        </div>
                        {entry.partOfSpeech ? (
                          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600">
                            {entry.partOfSpeech}
                          </div>
                        ) : null}
                        {entry.difficulty ? (
                          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600">
                            {entry.difficulty}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => speakText(entry.vocabulary)}
                          className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1.5 text-xs text-white"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          词条发音
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm leading-7 text-stone-700">
                      <div className="max-w-[320px] space-y-2">
                        <div>{resolveDisplayChinese(entry)}</div>
                        <div className="text-stone-500">{resolveSentenceChinese(entry)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm leading-7 text-stone-700">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="max-w-[460px]">
                          <div>{resolveExample(entry)}</div>
                          <div className="mt-2 text-stone-500">{resolveExampleChinese(entry)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakText(entry.example)}
                          disabled={!entry.example}
                          className="inline-flex items-center gap-1 rounded-full bg-[#f3eadf] px-3 py-1.5 text-xs text-stone-800 disabled:opacity-40"
                        >
                          <Mic2 className="h-3.5 w-3.5" />
                          例句发音
                        </button>
                        {selectedTask ? (
                          <button
                            type="button"
                            onPointerDown={stopEntryActionEvent}
                            onMouseDown={stopEntryActionEvent}
                            onTouchStart={stopEntryActionEvent}
                            onClick={(event) => {
                              stopEntryActionEvent(event);
                              confirmDeleteEntry(entry.id, entry.vocabulary);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除词条
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>

      </GlassCard>
    </div>
  );
}
