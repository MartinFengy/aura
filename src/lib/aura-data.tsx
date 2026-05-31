import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  BadgeCheck,
  BarChart3,
  BellRing,
  BookOpenText,
  Bot,
  BrainCircuit,
  ChartColumnBig,
  FileAudio2,
  FileImage,
  FileText,
  FileType2,
  Flame,
  FolderUp,
  Headphones,
  ImageUp,
  Languages,
  LayoutDashboard,
  Link2,
  MessageCircleMore,
  Mic2,
  NotebookPen,
  PanelsTopLeft,
  PenLine,
  Radar,
  ScanSearch,
  Settings,
  Sparkles,
  SquareLibrary,
  Target,
  TrendingUp,
  Trophy,
  Waves,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  shortLabel: string;
  description: string;
};

export const navItems: NavItem[] = [
  {
    label: "阅章",
    shortLabel: "阅章",
    href: "/reading",
    icon: BookOpenText,
    description: "英语资料整理中心",
  },
  {
    label: "词阁",
    shortLabel: "词阁",
    href: "/lexicon",
    icon: AudioLines,
    description: "单词学习与听写试炼",
  },
  {
    label: "行迹",
    shortLabel: "行迹",
    href: "/journey",
    icon: BarChart3,
    description: "学习数据分析中心",
  },
  {
    label: "设置",
    shortLabel: "设置",
    href: "/settings",
    icon: Settings,
    description: "同步与偏好配置",
  },
];

export const learningStats = [
  { label: "总词汇量", value: "3,286", icon: SquareLibrary },
  { label: "已掌握", value: "1,942", icon: BadgeCheck },
  { label: "模糊词汇", value: "417", icon: Radar },
  { label: "错题词汇", value: "126", icon: Flame },
];

export const conversations = [
  "经济学人截图精读",
  "雅思写作高频表达",
  "TED 演讲 OCR 词汇整理",
  "商业邮件高级替换",
];

export const readingInputTypes = [
  { label: "图片", icon: FileImage },
  { label: "PDF", icon: FileType2 },
  { label: "TXT", icon: FileText },
  { label: "DOCX", icon: NotebookPen },
  { label: "截图", icon: ImageUp },
];

export const readingFlow = [
  {
    title: "OCR识别与原文整理",
    text: "自动清洗扫描文本，保留段落节奏，让长文也适合继续学习。",
    icon: ScanSearch,
  },
  {
    title: "高级词汇与短语提取",
    text: "按句识别高级表达、词组搭配与核心语义，直接进入学习轨道。",
    icon: Sparkles,
  },
  {
    title: "例句与发音生成",
    text: "每个词条扩展例句和可播放发音，方便跟读、听写和复习。",
    icon: FileAudio2,
  },
];

export const readingActions = [
  { label: "保存到词阁", icon: FolderUp },
  { label: "导出飞书", icon: Link2 },
  { label: "编辑内容", icon: PenLine },
  { label: "继续追加词汇", icon: Sparkles },
];

export const lexiconModes = [
  { label: "听音写词", icon: Headphones },
  { label: "中文写英文", icon: Languages },
  { label: "句子听写", icon: Mic2 },
  { label: "英文选中文", icon: Target },
];

export const examStats = [
  { label: "正确率", value: "91%", icon: Trophy },
  { label: "总分", value: "87", icon: ChartColumnBig },
  { label: "错题数", value: "4", icon: BellRing },
  { label: "学习时长", value: "28 min", icon: Waves },
];

export const vocabularyCards = [
  {
    word: "resilient",
    phonetic: "/rɪˈzɪliənt/",
    meaning: "有韧性的，能迅速恢复的",
    example: "Aura turns each review cycle into resilient vocabulary memory.",
    icon: BrainCircuit,
  },
  {
    word: "articulate",
    phonetic: "/ɑːrˈtɪkjələt/",
    meaning: "表达清晰的；清楚说明",
    example: "The learner articulated the phrase after three listening rounds.",
    icon: MessageCircleMore,
  },
  {
    word: "incremental",
    phonetic: "/ˌɪnkrəˈmentl/",
    meaning: "递增的，逐步累积的",
    example: "Incremental exports keep the Feishu library organized over time.",
    icon: TrendingUp,
  },
];

export const masteryBars = [
  { label: "已掌握", width: "58%" },
  { label: "复习中", width: "27%" },
  { label: "高频错词", width: "15%" },
];

export const trendBars = [42, 57, 49, 73, 69, 81, 88];

export const mistakeWords = [
  { term: "subtle", score: "12 次" },
  { term: "inevitable", score: "9 次" },
  { term: "coherent", score: "8 次" },
  { term: "constraint", score: "7 次" },
];

export const settingsCards = [
  {
    title: "飞书同步",
    text: "修改飞书链接、测试连接、自动建表并按字段增量追加内容。",
    icon: Link2,
  },
  {
    title: "学习偏好",
    text: "自定义词汇等级、例句风格、发音语音与移动端默认试炼模式。",
    icon: PanelsTopLeft,
  },
  {
    title: "消息提醒",
    text: "支持每日复习提醒、错题回顾提醒与飞书同步结果通知。",
    icon: BellRing,
  },
];

export const settingFields = [
  { label: "Feishu Wiki", value: "https://my.feishu.cn/wiki/.../view=vewr8uJImR" },
  { label: "默认模型", value: "Doubao-1.5-pro" },
  { label: "OCR 引擎", value: "PaddleOCR" },
  { label: "存储空间", value: "Supabase Storage" },
];

export const heroHighlights = [
  { label: "AI English Learning System", icon: Bot },
  { label: "Upload · Analyze · Sync", icon: LayoutDashboard },
];
