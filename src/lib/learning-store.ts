export type RecognitionEntry = {
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
};

export type RecognitionTask = {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  rawText?: string;
  feishuLink?: string;
  entries: RecognitionEntry[];
  properNouns?: RecognitionEntry[];
};

export type DictationResult = "认识" | "模糊" | "不认识";

export type DictationMode = "词条听写" | "例句听写" | "中文听写";

export type DictationAnswer = {
  entryId: string;
  taskId: string;
  vocabulary: string;
  chinese: string;
  sentence: string;
  example: string;
  pronunciation: string;
  result: DictationResult;
};

export type DictationSession = {
  id: string;
  createdAt: string;
  taskIds: string[];
  taskNames: string[];
  totalQuestions: number;
  repeatCount: number;
  mode: DictationMode;
  correctCount: number;
  fuzzyCount: number;
  wrongCount: number;
  answers: DictationAnswer[];
};

export const TASKS_STORAGE_KEY = "aura-recognition-tasks";
export const DICTATION_HISTORY_STORAGE_KEY = "aura-dictation-history";
export const ACTIVE_USER_STORAGE_KEY = "aura-active-user";

export function normalizeUserKey(value?: null | string) {
  const normalized = value?.trim().toLowerCase();
  return normalized || "guest";
}

export function getTasksStorageKey(userKey: string) {
  return `${TASKS_STORAGE_KEY}:${normalizeUserKey(userKey)}`;
}

export function getDictationHistoryStorageKey(userKey: string) {
  return `${DICTATION_HISTORY_STORAGE_KEY}:${normalizeUserKey(userKey)}`;
}

export function getActiveUserKey() {
  if (typeof window === "undefined") {
    return "guest";
  }

  return normalizeUserKey(window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY));
}

export function setActiveUserKey(userKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeUserKey(userKey);
  window.localStorage.setItem(ACTIVE_USER_STORAGE_KEY, normalized);
  window.dispatchEvent(
    new CustomEvent("aura-active-user-change", { detail: normalized }),
  );
}

export function clearActiveUserKey() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("aura-active-user-change", { detail: "guest" }),
  );
}

export const initialRecognitionTasks: RecognitionTask[] = [
  {
    id: "task-economist",
    name: "经济学人截图精读",
    source: "Economist Screenshot",
    createdAt: "2026-05-21 09:20",
    properNouns: [],
    entries: [
      {
        id: "entry-1",
        sentence: "The policy shift created a resilient recovery across the manufacturing sector.",
        vocabulary: "resilient recovery",
        chinese: "有韧性的复苏",
        example: "The local market showed a resilient recovery after the holiday slump.",
        pronunciation: "resilient recovery",
        partOfSpeech: "noun phrase",
        sentenceChinese: "这项政策转变在制造业带来了具有韧性的复苏。",
        exampleChinese: "假期后的低迷过后，本地市场出现了有韧性的复苏。",
        difficulty: "B2",
        category: "learning",
      },
      {
        id: "entry-2",
        sentence: "Executives must articulate the long-term value before investors lose patience.",
        vocabulary: "articulate",
        chinese: "清晰表达",
        example: "She articulated the new pricing strategy in a concise way.",
        pronunciation: "articulate",
        partOfSpeech: "verb",
        sentenceChinese: "高管必须在投资者失去耐心之前清晰说明长期价值。",
        exampleChinese: "她用简洁的方式清晰说明了新的定价策略。",
        difficulty: "B2",
        category: "learning",
      },
      {
        id: "entry-3",
        sentence: "Incremental improvements often outperform dramatic but unstable reforms.",
        vocabulary: "incremental improvements",
        chinese: "渐进式改进",
        example: "Incremental improvements helped the team build trust week by week.",
        pronunciation: "incremental improvements",
        partOfSpeech: "noun phrase",
        sentenceChinese: "渐进式改进往往胜过剧烈但不稳定的改革。",
        exampleChinese: "渐进式改进帮助团队一周一周地建立了信任。",
        difficulty: "B2",
        category: "learning",
      },
    ],
  },
  {
    id: "task-ielts",
    name: "雅思写作高频表达",
    source: "IELTS Writing Notes",
    createdAt: "2026-05-20 20:10",
    properNouns: [],
    entries: [
      {
        id: "entry-4",
        sentence: "It is widely acknowledged that public transport reduces urban congestion.",
        vocabulary: "widely acknowledged",
        chinese: "被广泛认可",
        example: "It is widely acknowledged that habits shape long-term outcomes.",
        pronunciation: "widely acknowledged",
        partOfSpeech: "adjective phrase",
        sentenceChinese: "公共交通可以缓解城市拥堵，这一点被广泛认可。",
        exampleChinese: "习惯会塑造长期结果，这一点被广泛认可。",
        difficulty: "B2",
        category: "learning",
      },
      {
        id: "entry-5",
        sentence: "This trend is particularly evident among younger professionals.",
        vocabulary: "particularly evident",
        chinese: "尤为明显",
        example: "The change was particularly evident in the final quarter.",
        pronunciation: "particularly evident",
        partOfSpeech: "adjective phrase",
        sentenceChinese: "这一趋势在年轻职场人群中尤为明显。",
        exampleChinese: "这种变化在最后一个季度尤为明显。",
        difficulty: "B2",
        category: "learning",
      },
    ],
  },
  {
    id: "task-ted",
    name: "TED 演讲 OCR 词汇整理",
    source: "TED Transcript",
    createdAt: "2026-05-19 18:42",
    properNouns: [],
    entries: [
      {
        id: "entry-6",
        sentence: "Curiosity is the engine that sustains meaningful scientific inquiry.",
        vocabulary: "sustain",
        chinese: "维持，支撑",
        example: "Daily review can sustain your progress over a long period.",
        pronunciation: "sustain",
        partOfSpeech: "verb",
        sentenceChinese: "好奇心是支撑有意义科学探索的引擎。",
        exampleChinese: "每天复习可以在很长一段时间内维持你的进步。",
        difficulty: "B2",
        category: "learning",
      },
      {
        id: "entry-7",
        sentence: "A coherent narrative helps ideas travel further than isolated facts.",
        vocabulary: "coherent narrative",
        chinese: "连贯的叙述",
        example: "Her presentation used a coherent narrative from start to finish.",
        pronunciation: "coherent narrative",
        partOfSpeech: "noun phrase",
        sentenceChinese: "连贯的叙述能让观点比孤立的事实传播得更远。",
        exampleChinese: "她的演讲从头到尾都采用了连贯的叙述。",
        difficulty: "B2",
        category: "learning",
      },
    ],
  },
];

export function createTaskFromUpload(fileName: string): RecognitionTask {
  const slug = fileName.replace(/\.[^.]+$/, "") || "新识别任务";
  const createdAt = new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    id: `task-${Date.now()}`,
    name: `${slug} 识别结果`,
    source: fileName,
    createdAt,
    rawText: "",
    properNouns: [],
    entries: [
      {
        id: `entry-${Date.now()}-1`,
        sentence: `The uploaded material ${slug} contains advanced phrases worth reviewing repeatedly.`,
        vocabulary: "worth reviewing",
        chinese: "值得反复复习",
        example: "These expressions are worth reviewing before the next test.",
        pronunciation: "worth reviewing",
        partOfSpeech: "adjective phrase",
        sentenceChinese: `上传的材料 ${slug} 包含值得反复复习的高级表达。`,
        exampleChinese: "这些表达在下一次测试前值得复习。",
        difficulty: "B2",
        category: "learning",
      },
      {
        id: `entry-${Date.now()}-2`,
        sentence: `Aura can organize the extracted vocabulary into an incremental learning archive.`,
        vocabulary: "incremental learning archive",
        chinese: "渐进式学习档案",
        example: "An incremental learning archive keeps your notes searchable.",
        pronunciation: "incremental learning archive",
        partOfSpeech: "noun phrase",
        sentenceChinese: "Aura 可以把提取出的词汇整理成渐进式学习档案。",
        exampleChinese: "渐进式学习档案能让你的笔记保持可搜索。",
        difficulty: "B2",
        category: "learning",
      },
      {
        id: `entry-${Date.now()}-3`,
        sentence: `Each recognition task should preserve the original sentence for later dictation practice.`,
        vocabulary: "dictation practice",
        chinese: "听写练习",
        example: "We turned the article into a dictation practice set for tomorrow.",
        pronunciation: "dictation practice",
        partOfSpeech: "noun phrase",
        sentenceChinese: "每个识别任务都应该保留原句，以便后续进行听写练习。",
        exampleChinese: "我们把这篇文章整理成了明天要用的听写练习。",
        difficulty: "B1",
        category: "learning",
      },
    ],
  };
}

export function createTaskFromAnalysis(params: {
  fileName: string;
  rawText: string;
  entries: RecognitionEntry[];
  properNouns?: RecognitionEntry[];
  feishuLink?: string;
}) {
  const slug = params.fileName.replace(/\.[^.]+$/, "") || "新识别任务";
  const createdAt = new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    id: `task-${Date.now()}`,
    name: `${slug} 识别结果`,
    source: params.fileName,
    createdAt,
    rawText: params.rawText,
    feishuLink: params.feishuLink,
    entries: params.entries,
    properNouns: params.properNouns ?? [],
  } satisfies RecognitionTask;
}
