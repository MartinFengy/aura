"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { RecognitionTask } from "@/lib/learning-store";

const quickActions = [
  { label: "文字追加", icon: MessageSquareDashed },
  { label: "上传图片/文件", icon: ImagePlus },
];

const defaultAnalysisPrompt = `你现在是一位经验丰富、讲解细致的英文老师。请按照课堂讲解的标准，逐句深入分析原文，并且一定要从拆解长难句的角度出发：先看句子主干，再看修饰成分、固定搭配、短语动词、名词短语和新闻常用表达，然后提取真正值得讲解的块。

请从每句话中尽可能多提取中国高中英语水平以上的高质量单词、固定搭配、短语动词、名词短语、新闻常用表达，以及值得了解的人名、地名、机构名、头衔和其他专有名词。

不要只给每个长句提取 1 个词，但也不要机械地把一句话切成很多重复、重叠或不完整的小碎片；要优先保留像老师上课会重点讲解的完整表达（Minimal Complete Learning Unit），而不是普通句子片段。

同时舍弃 I、we、is、are、often、very、good、bad、big、small、make、do 等过于基础或学习价值低的词，除非它们构成固定搭配。

每个词条都要给出准确中文意思、原句翻译、自然例句、例句翻译和发音。

---

请按以下规则执行：

### 一、图片与原文还原

1. 只保留图片中真正有学习价值的英文内容，忽略 Logo、图标、时间戳、水印、UI、OCR 噪声和乱码。
2. cleanedText 必须按从上到下顺序完整还原所有可读英文，包括长图后半部分，不得遗漏、重复或打乱顺序。
3. sentence 必须是真实出现在 cleanedText 中的一条完整原句，不允许拼接或生成原文不存在的句子。

### 二、词条提取

4. 提取前先理解句子主干和修饰结构，但不要输出句法分析，只输出真正值得学习的语言知识点。
5. learningEntries 优先提取高质量单词、固定搭配、短语动词、名词短语、新闻表达和专业术语；properNouns 仅存放人物、地名、机构、组织、职位、头衔、事件等专有名词。
6. 每句优先提取 2~6 个 learningEntries，再补充 properNouns，不要让专有名词挤占学习词条。
7. 如果一句中还有更值得学习的动词、搭配、短语、名词短语，不要只提取国家、机构、人物、职位等专有名词。

### 三、禁止输出

不要输出：

- 完整句子
- 普通主谓结构（如 officials said、Local media reported、drones fell）
- 半截表达（如 life in prison without、Gilgo Beach serial）
- 没有固定意义的句子碎片（如 after Moscow、reported that）
- OCR 粘连内容或乱码

每个词条必须能够独立学习，而不是句子的一部分。

### 四、专有名词规则

同一个实体采用最长匹配原则，只保留最完整、最准确的一种表达。

例如：

Prime Minister Benjamin Netanyahu

不要再输出：

- Prime Minister Benjamin
- Minister Benjamin Netanyahu
- Benjamin Netanyahu
- Netanyahu

The European Union

不要再输出：

- European Union
- The European
- European
- Union

如果职位本身具有独立学习价值，可以额外保留一次职位，例如 Prime Minister。

全文同一个实体只保留一次。

### 五、去重规则

输出前统一去重：

- 大小写不同视为重复；
- 单复数视为重复；
- 动词时态、词形变化统一保留词典原形；
- 已保留完整表达，不再输出其组成部分；
- 包含关系和语义重复只保留学习价值最高的一项。

例如：

已经抽取：

air defense system

不要再输出：

- air defense
- defense system

已经抽取：

according to local media

不要再输出：

- according to
- local media

全文相同词条只能出现一次。

### 六、输出要求

- vocabulary 必须真实出现在对应 sentence 中。
- chinese、sentenceChinese、example、exampleChinese 必须自然、准确、完整。
- difficulty 使用 B1 / B2 / C1。
- pronunciation 使用适合 TTS 的英文读法。

---

后端固定约束（实际也会继续拼给模型）：

1. 必须按结构化 JSON 返回结果，而不是自由文本。
2. 返回字段包含 cleanedText、learningEntries、properNouns，其中：
   - learningEntries 包含：sentence、vocabulary、chinese、partOfSpeech、sentenceChinese、example、exampleChinese、difficulty、pronunciation。
   - properNouns 包含：sentence、vocabulary、chinese、partOfSpeech、sentenceChinese。
3. sentence 必须来自原文，vocabulary 必须真实出现在对应 sentence 中。
4. 不允许输出半截表达、重复表达、OCR 噪声、普通主谓新闻叙述或被完整词条覆盖的组成部分。
5. 优先保证 learningEntries 的学习价值，properNouns 仅作为补充，不得挤占 learningEntries。
6. 中文意思、原句翻译、例句、例句翻译等字段必须完整、准确，如缺失应自动补全。
7. 最终仅返回合法 JSON，不允许返回 Markdown 或其他解释文本。`;

const backendJsonSchemaPreview = `{
  "cleanedText": "string",
  "learningEntries": [
    {
      "sentence": "string",
      "vocabulary": "string",
      "chinese": "string",
      "partOfSpeech": "string",
      "sentenceChinese": "string",
      "example": "string",
      "exampleChinese": "string",
      "difficulty": "string",
      "pronunciation": "string"
    }
  ],
  "properNouns": [
    {
      "sentence": "string",
      "vocabulary": "string",
      "chinese": "string",
      "partOfSpeech": "string",
      "sentenceChinese": "string",
      "example": "string",
      "exampleChinese": "string",
      "difficulty": "string",
      "pronunciation": "string"
    }
  ]
}`;

const promptModeLabel = "当前模式：直接使用你的提示词";

function shouldMigrateLegacyPrompt(prompt: string) {
  const normalized = prompt.trim();
  if (!normalized) {
    return true;
  }

  const hasNewSections =
    normalized.includes("### 一、图片与原文还原") &&
    normalized.includes("### 二、词条提取") &&
    normalized.includes("### 六、输出要求");

  if (hasNewSections) {
    return false;
  }

  return (
    normalized.startsWith("你现在是一位经验丰富、讲解细致的英文老师。请按照课堂讲解的标准") ||
    normalized.includes("后端固定约束（实际也会继续拼给模型）") ||
    normalized.includes("返回字段会包含 cleanedText、learningEntries、properNouns")
  );
}

function appendAdditionalInstructions(basePrompt: string, extraInstructions: string) {
  const normalizedBasePrompt = basePrompt.trim() || defaultAnalysisPrompt;
  const normalizedExtraInstructions = extraInstructions.trim();
  if (!normalizedExtraInstructions) {
    return normalizedBasePrompt;
  }

  return `${normalizedBasePrompt}\n\n${normalizedExtraInstructions}`;
}

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

function normalizeSearchText(text: string) {
  return text
    .toLowerCase()
    .replace(/\b(?:[a-z]\.){2,}/g, (match) => match.replaceAll(".", ""))
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchVariants(term: string) {
  const normalized = normalizeSearchText(term);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);

  if (normalized.endsWith("ies")) {
    variants.add(`${normalized.slice(0, -3)}y`);
  } else if (normalized.endsWith("es")) {
    variants.add(normalized.slice(0, -2));
  } else if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
    variants.add(normalized.slice(0, -1));
  } else {
    variants.add(`${normalized}s`);
    variants.add(`${normalized}es`);
    if (normalized.endsWith("y")) {
      variants.add(`${normalized.slice(0, -1)}ies`);
    }
  }

  return Array.from(variants).filter(Boolean);
}

function splitRequestedItems(text: string) {
  return text
    .split(/[\n,，；;、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterEntriesForRequestedTerms(
  entries: Array<{
    id: string;
    sentence: string;
    vocabulary: string;
    chinese: string;
    example: string;
    pronunciation: string;
  }>,
  requestedTerms: string[],
) {
  if (requestedTerms.length === 0) {
    return entries;
  }

  const termVariants = requestedTerms.map((term) => buildSearchVariants(term)).filter(Boolean);

  return entries.filter((entry) => {
    const normalizedVocabulary = normalizeSearchText(entry.vocabulary);

    return termVariants.some((variants) =>
      variants.some(
        (variant) =>
          normalizedVocabulary.includes(variant) || variant.includes(normalizedVocabulary),
      ),
    );
  });
}

function tokenOverlapScore(source: string, target: string) {
  const sourceTokens = normalizeSearchText(source).split(" ").filter(Boolean);
  const targetTokens = normalizeSearchText(target).split(" ").filter(Boolean);

  if (sourceTokens.length === 0 || targetTokens.length === 0) {
    return 0;
  }

  const sourceSet = new Set(sourceTokens);
  const matched = targetTokens.filter((token) => sourceSet.has(token)).length;

  return matched / Math.max(targetTokens.length, 1);
}

function parseAppendRequest(text: string) {
  const cleanedText = text
    .replace(/^(?:请)?(?:继续)?(?:帮我)?(?:追加|添加|补充)/, "")
    .trim();

  const trailingDirectiveMatch = text.match(
    /(?:追加|添加|补充)\s*([A-Za-z][A-Za-z0-9\s'/-]{0,120})$/i,
  );
  if (trailingDirectiveMatch?.[1]?.trim()) {
    return {
      requestedTerms: Array.from(new Set(splitRequestedItems(trailingDirectiveMatch[1].trim()))),
      sentenceHints: [],
    };
  }

  const sentenceHints: string[] = [];
  let termSource = cleanedText;

  const sentenceAndTermMatch =
    cleanedText.match(/(.+?)(?:中的|里(?:的)?|当中的)(.+)$/) ??
    cleanedText.match(/(.+?)(?:这句话里的?|这句中的)(.+)$/);

  if (sentenceAndTermMatch) {
    const [, sentencePart, termPart] = sentenceAndTermMatch;
    if (sentencePart?.trim()) {
      sentenceHints.push(sentencePart.trim());
    }
    termSource = termPart.trim();
  } else if (/[.!?]/.test(cleanedText) && /[A-Za-z]/.test(cleanedText)) {
    sentenceHints.push(cleanedText);
  }

  const requestedTerms = splitRequestedItems(
    termSource
      .replace(/^(?:词|词语|短语|单词|表达)[:：]?\s*/i, "")
      .replace(/^(?:这个|这些|该)?\s*(?:词|词语|词组|短语|单词|表达)\s*/i, "")
      .replace(/\s+(?:这个|这些|该)\s*(?:词|短语|表达)\s*$/i, ""),
  );

  return {
    requestedTerms: Array.from(new Set(requestedTerms)),
    sentenceHints: Array.from(new Set(sentenceHints)),
  };
}

function findMatchedSentences(params: {
  taskSentences: string[];
  requestedTerms: string[];
  sentenceHints: string[];
}) {
  const matchedBySentence = new Set<string>();

  params.sentenceHints.forEach((hint) => {
    const normalizedHint = normalizeSearchText(hint);
    if (!normalizedHint) {
      return;
    }

    const exactSentence = params.taskSentences.find((sentence) => {
      const normalizedSentence = normalizeSearchText(sentence);
      return (
        normalizedSentence.includes(normalizedHint) ||
        normalizedHint.includes(normalizedSentence)
      );
    });

    if (exactSentence) {
      matchedBySentence.add(exactSentence);
      return;
    }

    const bestSentence = params.taskSentences
      .map((sentence) => ({
        sentence,
        score: tokenOverlapScore(sentence, hint),
      }))
      .sort((left, right) => right.score - left.score)[0];

    if (bestSentence && bestSentence.score >= 0.25) {
      matchedBySentence.add(bestSentence.sentence);
    }
  });

  params.taskSentences.forEach((sentence) => {
    const normalizedSentence = normalizeSearchText(sentence);
    const includesRequestedTerm = params.requestedTerms.some((term) =>
      buildSearchVariants(term).some((variant) => normalizedSentence.includes(variant)),
    );

    if (includesRequestedTerm) {
      matchedBySentence.add(sentence);
    }
  });

  return Array.from(matchedBySentence);
}

function collectTaskSentences(task: Pick<RecognitionTask, "rawText" | "entries">) {
  return Array.from(
    new Set([
      ...splitTranscriptSentences(task.rawText ?? ""),
      ...task.entries.map((entry) => entry.sentence.trim()).filter(Boolean),
    ]),
  );
}

function stopTaskActionEvent(event: {
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  event.preventDefault();
  event.stopPropagation();
}

function mergeAppendEntries(
  entries: Array<{
    id: string;
    sentence: string;
    vocabulary: string;
    chinese: string;
    example: string;
    pronunciation: string;
    partOfSpeech?: string;
    sentenceChinese?: string;
    exampleChinese?: string;
    difficulty?: string;
  }>,
  properNouns: Array<{
    id: string;
    sentence: string;
    vocabulary: string;
    chinese: string;
    example: string;
    pronunciation: string;
    partOfSpeech?: string;
    sentenceChinese?: string;
    exampleChinese?: string;
    difficulty?: string;
  }>,
) {
  const merged = [...entries];
  const seen = new Set(
    entries.map((entry) => `${normalizeSearchText(entry.sentence)}__${normalizeSearchText(entry.vocabulary)}`),
  );

  for (const entry of properNouns) {
    const key = `${normalizeSearchText(entry.sentence)}__${normalizeSearchText(entry.vocabulary)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function countTaskEntries(taskLike: {
  entries?: Array<unknown>;
  properNouns?: Array<unknown>;
}) {
  return (taskLike.entries?.length ?? 0) + (taskLike.properNouns?.length ?? 0);
}

function findAppendTarget(params: {
  tasks: RecognitionTask[];
  selectedTaskId?: string;
  requestedTerms: string[];
  sentenceHints: string[];
}) {
  const byTask = params.tasks
    .map((task) => {
      const taskSentences = collectTaskSentences(task);
      const matchedSentences = findMatchedSentences({
        taskSentences,
        requestedTerms: params.requestedTerms,
        sentenceHints: params.sentenceHints,
      });

      return {
        task,
        taskSentences,
        matchedSentences,
        score:
          matchedSentences.length * 10 +
          params.sentenceHints.reduce((total, hint) => {
            const bestMatch = taskSentences
              .map((sentence) => tokenOverlapScore(sentence, hint))
              .sort((left, right) => right - left)[0];
            return total + (bestMatch ?? 0);
          }, 0),
      };
    })
    .filter((candidate) => candidate.matchedSentences.length > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.task.id === params.selectedTaskId) {
        return -1;
      }

      if (right.task.id === params.selectedTaskId) {
        return 1;
      }

      return 0;
    });

  return byTask[0];
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
  const [draft, setDraft] = useState(defaultAnalysisPrompt);
  const [savedAnalysisPrompt, setSavedAnalysisPrompt] = useState(defaultAnalysisPrompt);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [taskNameDraft, setTaskNameDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptPreview =
    selectedAction === "上传图片/文件"
      ? draft || defaultAnalysisPrompt
      : draft;

  useEffect(() => {
    if (shouldMigrateLegacyPrompt(draft)) {
      setDraft(defaultAnalysisPrompt);
    }

    if (shouldMigrateLegacyPrompt(savedAnalysisPrompt)) {
      setSavedAnalysisPrompt(defaultAnalysisPrompt);
    }
  }, [draft, savedAnalysisPrompt]);

  const messages = useMemo(
    () =>
      createAgentMessages({
        selectedTaskName: selectedTask?.name,
        feishuLink: config.feishuLink,
        queuedFilesCount: queuedFiles.length,
      }),
    [config.feishuLink, queuedFiles.length, selectedTask?.name],
  );

  function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async function loadImageElement(imageUrl: string) {
    return withTimeout(
      new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("图片读取失败"));
        nextImage.src = imageUrl;
      }),
      12000,
      "图片读取超时",
    );
  }

  async function optimizeImage(file: File) {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      return file;
    }

    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await loadImageElement(imageUrl);

      const maxWidth = 2200;
      const maxHeight = 4200;
      const widthScale = image.width > maxWidth ? maxWidth / image.width : 1;
      const heightScale = image.height > maxHeight ? maxHeight / image.height : 1;
      const scale = Math.min(widthScale, heightScale, 1);
      const shouldResize = scale < 0.999;
      const shouldReencodeJpeg =
        file.type === "image/jpeg" && (file.size > 2.2 * 1024 * 1024 || image.height > 2800);
      const shouldReencodePng =
        file.type === "image/png" && file.size > 8 * 1024 * 1024;

      if (!shouldResize && !shouldReencodeJpeg && !shouldReencodePng) {
        return file;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      if (!context) {
        return file;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const targetMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await withTimeout(
        new Promise<Blob | null>((resolve) => {
          if (targetMimeType === "image/png") {
            canvas.toBlob(resolve, targetMimeType);
            return;
          }

          canvas.toBlob(resolve, targetMimeType, 0.92);
        }),
        10000,
        "图片压缩超时",
      ).catch(() => null);

      if (!blob) {
        return file;
      }

      const nextExtension = targetMimeType === "image/png" ? ".png" : ".jpg";
      return new File([blob], file.name.replace(/\.[^.]+$/, nextExtension), {
        type: targetMimeType,
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  async function inspectImageFile(file: File) {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      return {
        fileName: file.name,
        mimeType: file.type,
        width: 0,
        height: 0,
        uploadSize: file.size,
      };
    }

    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await loadImageElement(imageUrl);

      return {
        fileName: file.name,
        mimeType: file.type,
        width: image.width,
        height: image.height,
        uploadSize: file.size,
      };
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  type PreparedUploadImage = {
    files: File[];
    useOcrFirst: boolean;
    metadata: {
      fileName: string;
      mimeType: string;
      width: number;
      height: number;
      originalSize: number;
      uploadSize: number;
    };
  };

  async function prepareImageForUpload(file: File): Promise<PreparedUploadImage> {
    const metadata = await inspectImageFile(file);
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      return {
        files: [file],
        useOcrFirst: false,
        metadata: {
          ...metadata,
          originalSize: file.size,
          uploadSize: file.size,
        },
      };
    }
    return {
      files: [file],
      useOcrFirst: true,
      metadata: {
        ...metadata,
        originalSize: file.size,
        uploadSize: file.size,
      },
    };
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

  function confirmDeleteTask(taskId: string, taskName: string) {
    if (typeof window !== "undefined") {
      const shouldDelete = window.confirm(`确认删除任务「${taskName}」吗？删除后当前识别结果也会一并移除。`);
      if (!shouldDelete) {
        return;
      }
    }

    deleteTask(taskId);
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
    if (queuedFiles.length === 0 && tasks.length === 0 && selectedAction !== "文字追加") {
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

      const optimizedFiles: File[] = [];
      for (const [index, file] of queuedFiles.entries()) {
        if (queuedFiles.length > 1) {
          setStatusMessage(`正在处理第 ${index + 1}/${queuedFiles.length} 张图片，请稍候...`);
        }

        try {
          optimizedFiles.push(await optimizeImage(file));
        } catch {
          optimizedFiles.push(file);
        }
      }

      const preparedImages: PreparedUploadImage[] = [];
      for (const [index, file] of optimizedFiles.entries()) {
        if (optimizedFiles.length > 1) {
          setStatusMessage(`正在读取第 ${index + 1}/${optimizedFiles.length} 张图片信息，请稍候...`);
        }

        try {
          preparedImages.push(await prepareImageForUpload(file));
        } catch {
          preparedImages.push({
            files: [file],
            useOcrFirst: false,
            metadata: {
              fileName: file.name,
              mimeType: file.type,
              width: 0,
              height: 0,
              originalSize: queuedFiles[index]?.size ?? file.size,
              uploadSize: file.size,
            },
          });
        }
      }

      if (queuedFiles.length > 0) {
        setStatusMessage("图片准备完成，正在调用 Aura Agent 分析，请稍候...");
      }
      const filesToUpload = optimizedFiles;
      const imageMetadata = preparedImages.map((item, index) => ({
        ...item.metadata,
        originalSize: queuedFiles[index]?.size ?? item.metadata.originalSize,
      }));
      const formData = new FormData();
      let effectiveInstructions = draft.trim() || defaultAnalysisPrompt;
      let effectiveRawText = "";
      let targetTaskId = undefined as string | undefined;
      let targetTaskName = undefined as string | undefined;
      let targetExistingEntries: RecognitionTask["entries"] = [];
      let appendRequestedTerms: string[] = [];
      let directTermMode = false;

      filesToUpload.forEach((file) => {
        formData.append("files", file);
      });
      if (optimizedFiles.length === 1) {
        formData.append("sourceFileName", optimizedFiles[0].name);
      }

      if (queuedFiles.length === 0 && selectedAction === "文字追加") {
        effectiveRawText = selectedTask?.rawText ?? "";
        targetTaskId = selectedTask?.id;
        targetTaskName = selectedTask?.name;
        targetExistingEntries = selectedTask?.entries ?? [];
        const { requestedTerms, sentenceHints } = parseAppendRequest(draft);
        appendRequestedTerms = requestedTerms;

        if (requestedTerms.length === 0) {
          setStatusMessage("请输入要追加的单词或短语，也支持“某句中的某个词/短语”这种写法。");
          setIsAnalyzing(false);
          return;
        }

        const appendSearchTasks =
          sentenceHints.length > 0 ? tasks : selectedTask ? [selectedTask] : [];

        const matchedTarget = findAppendTarget({
          tasks: appendSearchTasks,
          selectedTaskId,
          requestedTerms,
          sentenceHints,
        });

        if (!matchedTarget) {
          if (sentenceHints.length > 0) {
            effectiveRawText = sentenceHints.join("\n");
            effectiveInstructions = appendAdditionalInstructions(
              draft,
              `当前是定向追加模式。请只追加这些指定词汇或短语本身：${requestedTerms.join("、")}。我提供了目标原句，请先在句子里定位这些表达；如果词语是单数/复数、大小写或轻微变形，请按同一表达处理。每个指定表达最多输出 1 条记录，不要扩展到其他相关词条，也不要补充额外单词。`,
            );
            setStatusMessage(
              "没有在本地任务里精确定位到原句，已改为基于你输入的原句提示直接补充提取。",
            );
          } else if (selectedTask?.rawText?.trim()) {
            targetTaskId = selectedTask.id;
            targetTaskName = selectedTask.name;
            targetExistingEntries = selectedTask.entries ?? [];
            effectiveRawText = selectedTask.rawText;
            effectiveInstructions = appendAdditionalInstructions(
              draft,
              `当前是定向追加模式。请在我提供的原文里逐句搜索这些指定词汇或短语：${requestedTerms.join("、")}。必须优先在原文中定位它们真实出现的位置，并直接使用原文里的完整句子。不要自行新造原句，不要把一个词拆成多个更小的片段，也不要扩展到未指定的其他词。若这些表达在原文中真实存在，就把它们逐条输出；若某个表达不存在，就忽略它。`,
            );
            setStatusMessage("没有精确命中局部句子，已改为在当前任务全文中搜索这些指定表达。");
          } else {
            directTermMode = true;
            targetTaskId = undefined;
            targetTaskName = undefined;
            targetExistingEntries = [];
            effectiveRawText = "";
            effectiveInstructions = appendAdditionalInstructions(
              draft,
              `当前是直接生成模式。请直接为这些指定词汇或短语生成学习卡片：${requestedTerms.join("、")}。每个词条都需要包含一个完整自然的英文句子、准确中文意思、一个新的英文例句，以及便于朗读的发音文本。不要依赖原文，也不要扩展到未指定的其他词。`,
            );
            setStatusMessage("已切换为直接生成词条模式，不再依赖原文。");
          }
        } else {
          targetTaskId = matchedTarget.task.id;
          targetTaskName = matchedTarget.task.name;
          targetExistingEntries = matchedTarget.task.entries ?? [];
          effectiveRawText = matchedTarget.matchedSentences.join("\n");
          effectiveInstructions = appendAdditionalInstructions(
            draft,
            `当前是定向追加模式。请只追加这些指定词汇或短语本身：${requestedTerms.join("、")}。先找到它们所在的原句，再只输出这些指定表达各自对应的词条。不要扩展到句子里的其他高质量词汇，不要补充其他相关词条，也不要重复已有内容。若我给出了目标句子提示，请优先以该句为准。`,
          );
          setStatusMessage(`将基于任务「${matchedTarget.task.name}」中的对应原句继续追加。`);
        }
      }

      formData.append("instructions", effectiveInstructions);
      formData.append("feishuLink", config.feishuLink);
      formData.append("arkBaseUrl", config.arkBaseUrl);
      formData.append("arkModel", config.arkModel);
      formData.append("existingRawText", effectiveRawText);
      formData.append("existingEntries", JSON.stringify(targetExistingEntries));
      formData.append("requestedTerms", JSON.stringify(appendRequestedTerms));
      formData.append("directTermMode", directTermMode ? "1" : "0");
      formData.append("imageMetadata", JSON.stringify(imageMetadata));
      if (queuedFiles.length > 0) {
        formData.append("preferVision", "1");
        formData.append("fastMode", "1");
        formData.append("directJsonMode", "1");
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      const responseContentType = response.headers.get("content-type") ?? "";
      let payload: {
        cleanedText?: string;
        rawText?: string;
        mode?: "vision" | "vision-fallback";
        effectiveModel?: string;
        effectiveVisionModel?: string;
        resolvedModelId?: string;
        resolvedVisionModelId?: string;
        ocrMethod?: "vision" | "tesseract" | "hybrid";
        feishuLink?: string;
        entries?: Array<{
          id: string;
          sentence: string;
          vocabulary: string;
          chinese: string;
          example: string;
          pronunciation: string;
          partOfSpeech?: string;
          sentenceChinese?: string;
          exampleChinese?: string;
          difficulty?: string;
          category?: "learning" | "proper-noun";
        }>;
        properNouns?: Array<{
          id: string;
          sentence: string;
          vocabulary: string;
          chinese: string;
          example: string;
          pronunciation: string;
          partOfSpeech?: string;
          sentenceChinese?: string;
          exampleChinese?: string;
          difficulty?: string;
          category?: "learning" | "proper-noun";
        }>;
        diagnostics?: {
          imageCount?: number;
          ocrTextLength?: number;
          ocrTextLines?: number;
          aiInputLength?: number;
          aiOutputCount?: number;
          finalDisplayCount?: number;
          method?: "vision" | "tesseract" | "hybrid";
        };
        fileName?: string;
        error?: string;
      };

      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        const normalizedText = responseText.trim();
        const isTimeoutResponse =
          normalizedText.includes("FUNCTION_INVOCATION_TIMEOUT") ||
          normalizedText.includes("The Serverless Function has timed out") ||
          response.status === 504;
        const isHtmlResponse =
          responseContentType.includes("text/html") ||
          normalizedText.startsWith("<!doctype html") ||
          normalizedText.startsWith("<html");

        if (isTimeoutResponse) {
          throw new Error(
            "上传分析超时了。当前这次图片识别耗时过长，服务还没来得及返回结果。请优先上传更清晰的单张截图，或减少一次上传的图片数量后重试。",
          );
        }

        if (isHtmlResponse) {
          throw new Error("分析服务暂时返回了异常页面，请稍后重试一次。");
        }

        throw new Error(
          `分析接口返回了非 JSON 内容：${responseText.slice(0, 160) || "空响应"}`,
        );
      }

      if (payload.diagnostics) {
        console.info("[Aura analyze diagnostics]", payload.diagnostics);
      }

      if (!response.ok || payload.error) {
        const errorMessage = payload.error || "分析失败";
        const modelHint =
          payload.effectiveModel || payload.effectiveVisionModel
            ? `（文本模型：${payload.effectiveModel ?? config.arkModel}${
                payload.resolvedModelId ? ` / ${payload.resolvedModelId}` : ""
              }；图片识别：${payload.effectiveVisionModel ?? "视觉模型"}${
                payload.resolvedVisionModelId ? ` / ${payload.resolvedVisionModelId}` : ""
              }）`
            : "";
        throw new Error(`${errorMessage}${modelHint}`);
      }

      const resolvedEntries =
        queuedFiles.length === 0 && selectedAction === "文字追加" && !directTermMode
          ? filterEntriesForRequestedTerms(payload.entries ?? [], appendRequestedTerms)
          : (payload.entries ?? []);
      const resolvedProperNouns =
        queuedFiles.length === 0 && selectedAction === "文字追加" && !directTermMode
          ? filterEntriesForRequestedTerms(payload.properNouns ?? [], appendRequestedTerms)
          : (payload.properNouns ?? []);
      const finalResolvedEntries = resolvedEntries;
      const finalResolvedProperNouns = resolvedProperNouns;
      const combinedResolvedEntries = mergeAppendEntries(
        finalResolvedEntries,
        finalResolvedProperNouns,
      );

      if (
        queuedFiles.length === 0 &&
        selectedAction === "文字追加" &&
        appendRequestedTerms.length > 0 &&
        combinedResolvedEntries.length === 0
      ) {
        throw new Error("没有为你指定的词或短语生成可追加结果，请换一个表达后再试。");
      }

      if (queuedFiles.length > 0 || (selectedAction === "文字追加" && !targetTaskId)) {
        const task = createTaskFromAnalysis({
          fileName:
            payload.fileName ??
            (appendRequestedTerms.length > 0 ? appendRequestedTerms.join("、") : queuedFiles[0]?.name) ??
            "新识别任务",
          rawText: payload.rawText ?? payload.cleanedText ?? "",
          entries: combinedResolvedEntries,
          properNouns: [],
          feishuLink: payload.feishuLink ?? config.feishuLink,
        });

        const savedTask = addTaskFromAnalysis(task);
        const savedCount = countTaskEntries(savedTask);
        setQueuedFiles([]);
        setStatusMessage(
          `分析完成，已生成 ${savedCount} 条词汇/短语。文本模型：${payload.effectiveModel ?? config.arkModel}${
            payload.resolvedModelId ? ` / ${payload.resolvedModelId}` : ""
          }；图片识别：${payload.effectiveVisionModel ?? config.arkModel}${
            payload.resolvedVisionModelId ? ` / ${payload.resolvedVisionModelId}` : ""
          }${
            payload.ocrMethod === "hybrid"
              ? "（已使用 OCR + AI 混合补全）"
              : payload.ocrMethod === "tesseract"
                ? "（已优先使用本地 OCR）"
                : ""
          }。`,
        );
      } else if (targetTaskId) {
        const savedTask = appendAnalysisToTask({
          taskId: targetTaskId,
          rawText: payload.rawText ?? payload.cleanedText,
          entries: combinedResolvedEntries,
          properNouns: [],
          feishuLink: payload.feishuLink ?? config.feishuLink,
        });
        const savedCount = savedTask ? countTaskEntries(savedTask) : combinedResolvedEntries.length;
        setQueuedFiles([]);
        setStatusMessage(
          `分析完成，已生成 ${savedCount} 条词汇/短语${
            targetTaskName ? `，已追加到「${targetTaskName}」` : ""
          }。文本模型：${payload.effectiveModel ?? config.arkModel}${
            payload.resolvedModelId ? ` / ${payload.resolvedModelId}` : ""
          }；图片识别：${payload.effectiveVisionModel ?? config.arkModel}${
            payload.resolvedVisionModelId ? ` / ${payload.resolvedVisionModelId}` : ""
          }${
            payload.ocrMethod === "hybrid"
              ? "（已使用 OCR + AI 混合补全）"
              : payload.ocrMethod === "tesseract"
                ? "（已优先使用本地 OCR）"
                : ""
          }。`,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "分析失败，请稍后再试。";
      setStatusMessage(errorMessage);
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
                      <div className="rounded-xl">
                        <p className="font-medium">{task.name}</p>
                        <p className={`mt-2 text-xs ${active ? "text-stone-300" : "text-stone-500"}`}>
                          {task.entries.length} 条词汇 · {task.createdAt}
                        </p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                            active ? "bg-white/15 text-white" : "bg-stone-900 text-white"
                          }`}
                        >
                          <Languages className="h-3.5 w-3.5" />
                          切换任务
                        </button>
                        <button
                          type="button"
                          onPointerDown={stopTaskActionEvent}
                          onMouseDown={stopTaskActionEvent}
                          onTouchStart={stopTaskActionEvent}
                          onClick={(event) => {
                            stopTaskActionEvent(event);
                            startRename(task.id, task.name);
                          }}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                            active ? "bg-white/15 text-white" : "bg-white text-stone-700"
                          }`}
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          改名
                        </button>
                        <button
                          type="button"
                          onPointerDown={stopTaskActionEvent}
                          onMouseDown={stopTaskActionEvent}
                          onTouchStart={stopTaskActionEvent}
                          onClick={(event) => {
                            stopTaskActionEvent(event);
                            confirmDeleteTask(task.id, task.name);
                          }}
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

        <div className="min-w-0 rounded-[30px] border border-white/70 bg-[#fffdfa]/80 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-stone-900 p-2 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-full break-words rounded-[24px] rounded-tl-md bg-[#f1e8dc] px-4 py-3 text-sm leading-7 text-stone-700 sm:max-w-[88%]">
                {messages[0]}
              </div>
            </div>

            <div className="flex items-start justify-end gap-3">
              <div className="max-w-full sm:max-w-[92%]">
                <div className="mb-2 text-right text-[11px] tracking-[0.08em] text-stone-500">
                  {promptModeLabel}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAction !== "文字追加" && draft.trim()) {
                      setSavedAnalysisPrompt(draft);
                    }
                  }}
                  className="w-full break-words rounded-[24px] rounded-tr-md bg-stone-900 px-4 py-3 text-left text-sm leading-7 text-white transition hover:bg-stone-800"
                >
                  {promptPreview}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-white p-2 text-stone-700 shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="max-w-full break-words rounded-[24px] rounded-tl-md border border-white/70 bg-white/90 px-4 py-3 text-sm leading-7 text-stone-700 sm:max-w-[88%]">
                {messages[1]}
              </div>
            </div>

            {selectedAction === "上传图片/文件" ? (
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-white p-2 text-stone-700 shadow-sm">
                  <FileCheck2 className="h-4 w-4" />
                </div>
                <div className="max-w-full break-words rounded-[24px] rounded-tl-md border border-white/70 bg-[#fffdfa] px-4 py-3 text-sm leading-7 text-stone-700 sm:max-w-[92%]">
                  <div className="mb-2 text-[11px] tracking-[0.08em] text-stone-500">
                    后端 JSON Schema
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-stone-700">
                    {backendJsonSchemaPreview}
                  </pre>
                </div>
              </div>
            ) : null}
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
                    setDraft(savedAnalysisPrompt.trim() ? savedAnalysisPrompt : defaultAnalysisPrompt);
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
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
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
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDraft(nextValue);
                  if (selectedAction !== "文字追加" && nextValue.trim()) {
                    setSavedAnalysisPrompt(nextValue);
                  }
                }}
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
