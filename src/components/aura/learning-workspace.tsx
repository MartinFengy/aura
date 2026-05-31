"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bot,
  CloudUpload,
  PencilLine,
  RefreshCcw,
  Trash2,
  FileCheck2,
  FileImage,
  ImagePlus,
  Languages,
  LoaderCircle,
  MessageSquareDashed,
  Paperclip,
  Send,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/aura/glass-card";
import { useAuraConfig } from "@/hooks/use-aura-config";
import {
  createTaskFromAnalysis,
  useLearningTasks,
} from "@/hooks/use-learning-tasks";

const quickActions = [
  { label: "文字追加", icon: MessageSquareDashed },
  { label: "上传图片/文件", icon: ImagePlus },
];

function splitTranscriptSentences(transcript: string) {
  const protectedText = transcript.replace(
    /\b(?:[A-Z]\.){2,}/g,
    (match) => match.replaceAll(".", "<dot>"),
  );

  return protectedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replaceAll("<dot>", ".").trim())
    .filter((sentence) => /[A-Za-z]/.test(sentence));
}

function parseRequestedTerms(text: string) {
  return text
    .split(/[\n,，；;、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createAgentMessages(params: {
  selectedTaskName?: string;
  feishuLink: string;
  queuedFilesCount: number;
}) {
  const taskLabel = params.selectedTaskName ?? "当前材料";
  return [
    `我是 Aura，你可以一次上传多张英语图片，我会合并原文后逐句提取高于高中英语水平的单词和短语，并整理到飞书多维表格。当前同步目标：${params.feishuLink}`,
    params.queuedFilesCount > 0
      ? `已准备 ${params.queuedFilesCount} 个文件。发送后我会先整合原文，再输出完整句子、词汇短语、中文意思、例句和可播放发音。`
      : `当前选中任务是「${taskLabel}」。如果你现在直接发送，我会基于这个任务继续追加新的词汇或短语，并避免和已有内容重复。`,
  ];
}

export function LearningWorkspace() {
  const {
    tasks,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    addTaskFromAnalysis,
    appendAnalysisToTask,
    renameTask,
    deleteTask,
  } = useLearningTasks();
  const { config, setFeishuLink, resetFeishuLink } = useAuraConfig();
  const [selectedAction, setSelectedAction] = useState(quickActions[0].label);
  const [draft, setDraft] = useState(
    "请仔细阅读原文，对每句话尽可能提取更多高质量、超过高中英语水平的单词和短语，也可以提取有学习价值的人名、地名、机构名、头衔和其他专有名词，并给出中文意思、例句和发音。",
  );
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [taskNameDraft, setTaskNameDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const messages = useMemo(
    () =>
      createAgentMessages({
        selectedTaskName: selectedTask?.name,
        feishuLink: config.feishuLink,
        queuedFilesCount: queuedFiles.length,
      }),
    [config.feishuLink, queuedFiles.length, selectedTask?.name],
  );

  async function optimizeImage(file: File) {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      return file;
    }

    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("图片读取失败"));
        nextImage.src = imageUrl;
      });

      const maxWidth = 1600;
      const scale = image.width > maxWidth ? maxWidth / image.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      if (!context) {
        return file;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.84);
      });

      if (!blob) {
        return file;
      }

      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
        type: "image/jpeg",
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) {
      return;
    }

    const nextFiles = Array.from(files);
    setQueuedFiles(nextFiles);
    setStatusMessage(
      nextFiles.length > 0 ? `已添加 ${nextFiles.length} 个文件，点击发送开始整合分析。` : "",
    );
  }

  function removeFile(fileName: string) {
    setQueuedFiles((current) => current.filter((file) => file.name !== fileName));
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

  async function analyzeUpload() {
    if (queuedFiles.length === 0 && !selectedTask?.rawText) {
      setStatusMessage("请先上传图片，或者先选中一个已有任务再继续追加词汇。");
      return;
    }

    try {
      setIsAnalyzing(true);
      setStatusMessage(
        queuedFiles.length > 0
          ? "正在压缩多张图片并调用 Aura Agent，请稍候..."
          : "正在基于已有材料继续追加词汇，请稍候...",
      );

      const uploadFiles = await Promise.all(queuedFiles.map((file) => optimizeImage(file)));
      const formData = new FormData();
      let effectiveInstructions = draft;
      let effectiveRawText = selectedTask?.rawText ?? "";

      uploadFiles.forEach((file) => {
        formData.append("files", file);
      });

      if (queuedFiles.length === 0 && selectedAction === "文字追加" && selectedTask?.rawText) {
        const requestedTerms = parseRequestedTerms(draft);
        if (requestedTerms.length === 0) {
          setStatusMessage("请输入要追加的单词或短语，支持用逗号、顿号或换行分隔。");
          setIsAnalyzing(false);
          return;
        }

        const taskSentences = Array.from(
          new Set([
            ...splitTranscriptSentences(selectedTask.rawText),
            ...selectedTask.entries.map((entry) => entry.sentence.trim()).filter(Boolean),
          ]),
        );
        const matchedSentences = taskSentences.filter((sentence) =>
          requestedTerms.some((term) =>
            sentence.toLowerCase().includes(term.toLowerCase()),
          ),
        );

        if (matchedSentences.length === 0) {
          setStatusMessage("没有在当前任务原文里找到这些词或短语，请换一个表达后再试。");
          setIsAnalyzing(false);
          return;
        }

        effectiveRawText = matchedSentences.join("\n");
        effectiveInstructions = `请优先围绕这些指定词汇或短语追加结果：${requestedTerms.join("、")}。先找到它们所在的原句，再把对应句子里的高质量单词、短语、专有名词、人名、地名、机构名整理进结果里，不要重复已有词条。`;
      }

      formData.append("instructions", effectiveInstructions);
      formData.append("feishuLink", config.feishuLink);
      formData.append("existingRawText", effectiveRawText);
      formData.append("existingEntries", JSON.stringify(selectedTask?.entries ?? []));

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        cleanedText?: string;
        rawText?: string;
        mode?: "vision" | "vision-fallback";
        feishuLink?: string;
        entries?: Array<{
          id: string;
          sentence: string;
          vocabulary: string;
          chinese: string;
          example: string;
          pronunciation: string;
        }>;
        fileName?: string;
        error?: string;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error || "分析失败");
      }

      if (queuedFiles.length > 0) {
        const task = createTaskFromAnalysis({
          fileName: payload.fileName ?? queuedFiles[0]?.name ?? "新识别任务",
          rawText: payload.rawText ?? payload.cleanedText ?? "",
          entries: payload.entries ?? [],
          feishuLink: payload.feishuLink ?? config.feishuLink,
        });

        addTaskFromAnalysis(task);
      } else if (selectedTask) {
        appendAnalysisToTask({
          taskId: selectedTask.id,
          rawText: payload.rawText ?? payload.cleanedText,
          entries: payload.entries ?? [],
          feishuLink: payload.feishuLink ?? config.feishuLink,
        });
      }

      setQueuedFiles([]);
      setStatusMessage(
        `分析完成，已生成 ${(payload.entries ?? []).length} 条结果，将写入飞书：${
          payload.feishuLink ?? config.feishuLink
        }`,
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "分析失败，请稍后再试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <GlassCard className="p-5 sm:p-7">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Aura Agent Workspace</p>
          <h3 className="mt-2 text-2xl font-semibold text-stone-900">当前整理任务</h3>
        </div>
        <div className="inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm text-stone-600">
          {selectedTask?.name ?? "等待新材料"}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/55 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stone-700">
            <Languages className="h-4 w-4" />
            历史任务
          </div>
          <div className="space-y-3">
            {tasks.map((task) => {
              const active = selectedTaskId === task.id;
              return (
                <div
                  key={task.id}
                  className={`rounded-2xl px-3 py-3 text-sm transition ${
                    active
                      ? "bg-stone-900 text-white"
                      : "border border-white/65 bg-[#fbf8f4] text-stone-600 hover:bg-white"
                  }`}
                >
                  {editingTaskId === task.id ? (
                    <div className="space-y-3">
                      <input
                        value={taskNameDraft}
                        onChange={(event) => setTaskNameDraft(event.target.value)}
                        className="w-full rounded-xl border border-white/30 bg-white/90 px-3 py-2 text-sm text-stone-800 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={submitRename}
                          className="rounded-full bg-white px-3 py-1.5 text-xs text-stone-900"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTaskId("");
                            setTaskNameDraft("");
                          }}
                          className="rounded-full border border-white/40 px-3 py-1.5 text-xs"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className="w-full text-left"
                      >
                        <p className="font-medium">{task.name}</p>
                        <p className={`mt-2 text-xs ${active ? "text-stone-300" : "text-stone-500"}`}>
                          {task.entries.length} 条词汇 · {task.createdAt}
                        </p>
                      </button>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => startRename(task.id, task.name)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                            active ? "bg-white/15 text-white" : "bg-white text-stone-700"
                          }`}
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          改名
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                            active ? "bg-white/15 text-white" : "bg-white text-stone-700"
                          }`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/70 bg-[#fffdfa]/80 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-stone-900 p-2 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[88%] rounded-[24px] rounded-tl-md bg-[#f1e8dc] px-4 py-3 text-sm leading-7 text-stone-700">
                {messages[0]}
              </div>
            </div>

            <div className="flex items-start justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setDraft("请在原有结果基础上继续追加新的高级词汇和短语，不要重复已有词条。")
                }
                className="max-w-[92%] rounded-[24px] rounded-tr-md bg-stone-900 px-4 py-3 text-left text-sm leading-7 text-white transition hover:bg-stone-800"
              >
                {draft}
              </button>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-white p-2 text-stone-700 shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="max-w-[88%] rounded-[24px] rounded-tl-md border border-white/70 bg-white/90 px-4 py-3 text-sm leading-7 text-stone-700">
                {messages[1]}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {quickActions.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setSelectedAction(label);
                  if (label === "文字追加") {
                    setDraft("");
                  }
                  if (label === "上传图片/文件") {
                    if (!draft.trim()) {
                      setDraft("请仔细阅读原文，对每句话尽可能提取更多高质量、超过高中英语水平的单词和短语，也可以提取有学习价值的人名、地名、机构名、头衔和其他专有名词，并给出中文意思、例句和发音。");
                    }
                    fileInputRef.current?.click();
                  }
                }}
                className={`rounded-2xl border px-3 py-3 text-center text-sm transition ${
                  selectedAction === label
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-white/65 bg-[#f8f4ef] text-stone-600 hover:bg-white"
                }`}
              >
                <div className="mb-2 flex justify-center">
                  <Icon className="h-4 w-4" />
                </div>
                {label}
              </button>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
            className="hidden"
          />

          <div className="mt-5 rounded-[24px] border border-white/70 bg-white/85 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-700">
              <Languages className="h-4 w-4" />
              飞书多维表格链接
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={config.feishuLink}
                onChange={(event) => setFeishuLink(event.target.value)}
                className="min-w-0 flex-1 rounded-[18px] border border-white/70 bg-[#f7f2eb] px-4 py-3 text-sm text-stone-700 outline-none"
              />
              <button
                type="button"
                onClick={resetFeishuLink}
                className="rounded-[18px] border border-white/65 bg-white px-4 py-3 text-sm text-stone-700"
              >
                使用默认链接
              </button>
            </div>
          </div>

          {queuedFiles.length > 0 ? (
            <div className="mt-5 rounded-[24px] border border-white/70 bg-white/80 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-700">
                <Paperclip className="h-4 w-4" />
                待分析文件
              </div>
              <div className="flex flex-wrap gap-2">
                {queuedFiles.map((file) => (
                  <div
                    key={file.name}
                    className="inline-flex items-center gap-2 rounded-full bg-[#f4ede5] px-3 py-2 text-sm text-stone-700"
                  >
                    {file.type.startsWith("image/") ? (
                      <FileImage className="h-4 w-4" />
                    ) : (
                      <FileCheck2 className="h-4 w-4" />
                    )}
                    {file.name}
                    <button type="button" onClick={() => removeFile(file.name)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 rounded-[26px] border border-white/70 bg-white/85 p-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-3 rounded-2xl bg-[#f7f2eb] px-4 py-3 text-sm text-stone-500">
              <CloudUpload className="h-4 w-4" />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            <button
              type="button"
              onClick={analyzeUpload}
              disabled={isAnalyzing}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-70"
            >
              {isAnalyzing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isAnalyzing ? "分析中" : queuedFiles.length > 0 ? "开始分析" : "继续追加"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {[
              {
                label: "智能体能力",
                value: "多图合并后逐句提取高级词汇与短语",
                icon: WandSparkles,
              },
              {
                label: "当前任务",
                value: selectedTask?.name ?? "等待上传新材料",
                icon: Languages,
              },
              {
                label: "飞书输出",
                value: "完整句子 / 词汇短语 / 中文 / 例句 / 发音",
                icon: Languages,
              },
              {
                label: "任务管理",
                value: "支持改名、删除与继续追加",
                icon: RefreshCcw,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-[24px] border border-white/70 bg-white/75 px-4 py-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-stone-500">{label}</p>
                  <Icon className="h-4 w-4 text-stone-700" />
                </div>
                <p className="mt-3 text-sm leading-7 text-stone-800">{value}</p>
              </div>
            ))}
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-[20px] border border-white/70 bg-white/85 px-4 py-3 text-sm text-stone-700">
              {statusMessage}
            </div>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
