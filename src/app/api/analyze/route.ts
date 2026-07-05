import { NextResponse } from "next/server";
import path from "node:path";
import { DEFAULT_ARK_MODEL, getArkModelOption } from "@/lib/aura-config";
import type { RecognitionEntry } from "@/lib/learning-store";
import { DEFAULT_FEISHU_LINK } from "@/lib/aura-config";
import {
  isLowQualityExample as sharedIsLowQualityExample,
  isLowQualitySourceSentence,
} from "@/lib/recognition-quality";

export const runtime = "nodejs";
export const maxDuration = 120;

type ArkResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type StructuredEntry = {
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

type TranscriptStructuredPayload = {
  cleanedText?: string;
  entries?: StructuredEntry[];
  learningEntries?: StructuredEntry[];
  properNouns?: StructuredEntry[];
};

type OcrMethod = "vision" | "tesseract" | "hybrid";

type ImageUploadMetadata = {
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  uploadSize: number;
};

type ImageStageDiagnostics = {
  rawLength: number;
  cleanedLength: number;
  lineCount: number;
  sentenceCount: number;
  preview: string;
};

type FileDiagnostics = {
  fileName: string;
  image: ImageUploadMetadata | null;
  ocr: ImageStageDiagnostics | null;
  visionDefault: ImageStageDiagnostics | null;
  visionExhaustive: ImageStageDiagnostics | null;
  mergedTranscript: ImageStageDiagnostics | null;
  extractionMethod: OcrMethod;
};

type AnalysisDiagnostics = {
  imageCount: number;
  images: ImageUploadMetadata[];
  files: FileDiagnostics[];
  ocrTextLength: number;
  ocrTextLines: number;
  ocrSentenceCount: number;
  aiInputLength: number;
  aiInputSentenceCount: number;
  aiSeedEntryCount: number;
  aiOutputCount: number;
  finalDisplayCount: number;
  coveredSentenceCount: number;
  uncoveredSentenceCount: number;
  coveredSentences: string[];
  uncoveredSentences: string[];
  method: OcrMethod;
};

function summarizeSentenceCoverage(transcript: string, entries: StructuredEntry[]) {
  const transcriptSentences = Array.from(new Set(splitTranscriptSentences(transcript)));
  const coveredSentenceKeys = new Set(entries.map((entry) => normalizeSentence(entry.sentence)));
  const coveredSentences = transcriptSentences.filter((sentence) =>
    coveredSentenceKeys.has(normalizeSentence(sentence)),
  );
  const uncoveredSentences = transcriptSentences.filter(
    (sentence) => !coveredSentenceKeys.has(normalizeSentence(sentence)),
  );

  return {
    coveredSentenceCount: coveredSentences.length,
    uncoveredSentenceCount: uncoveredSentences.length,
    coveredSentences,
    uncoveredSentences,
  };
}

function canUseServerTesseract() {
  return !(process.env.VERCEL === "1" || process.env.VERCEL_ENV);
}

const HEURISTIC_CHINESE_GLOSSARY: Record<string, string> = {
  "san diego": "圣迭戈",
  mosque: "清真寺",
  radicalized: "被极端化；被激进化",
  "radicalized online": "在网络上被极端化",
  "white supremacist": "白人至上主义者",
  "white supremacist views": "白人至上主义观点",
  shooting: "枪击事件",
  "xi jinping": "习近平",
  "president xi jinping": "国家主席习近平",
  "chinese president xi jinping": "中国国家主席习近平",
  "vladimir putin": "弗拉基米尔·普京",
  "president vladimir putin": "弗拉基米尔·普京总统",
  "russian president vladimir putin": "俄罗斯总统弗拉基米尔·普京",
  beijing: "北京",
  putin: "普京",
  "donald trump": "唐纳德·特朗普",
  "president trump": "特朗普总统",
  "close ties": "紧密关系",
  "trade and international affairs": "贸易与国际事务",
  "international affairs": "国际事务",
  congressman: "国会议员",
  "thomas massie": "托马斯·马西",
  "congressman thomas massie": "国会议员托马斯·马西",
  kentucky: "肯塔基州",
  "republican primary": "共和党初选",
  critic: "批评者",
  "trump critic": "特朗普的批评者",
  "evacuation orders": "疏散令",
  "ventura county": "文图拉县",
  california: "加利福尼亚州",
  "los angeles": "洛杉矶",
  "sandy fire": "桑迪山火",
  "square miles": "平方英里",
  "dry brush": "干燥灌木丛",
  "president volodymyr zelenskyy": "乌克兰总统弗拉基米尔·泽连斯基",
  "volodymyr zelenskyy": "弗拉基米尔·泽连斯基",
  volodymyr: "弗拉基米尔",
  zelenskyy: "泽连斯基",
  petersburg: "彼得堡",
  "st petersburg": "圣彼得堡",
  "igniting a fire": "引发大火",
  "ignite a fire": "引发大火",
  "oil depot": "石油库；油料库",
  "drones struck": "无人机袭击了",
  "struck an oil depot": "袭击了一处油库",
  drones: "无人机",
  struck: "袭击；击中",
  fire: "火灾；大火",
  grill: "烧烤；烤制",
  backlash: "强烈反对；激烈反应",
  "executive order": "行政命令",
  "federal government": "联邦政府",
  "artificial intelligence": "人工智能",
  "advanced ai systems": "先进人工智能系统",
  "national security": "国家安全",
  "national security risks": "国家安全风险",
  "public release": "公开发布",
  "similar policy": "类似政策",
  "america's edge": "美国优势",
  "ai technology": "人工智能技术",
  "the president": "总统",
  "secretary of state": "国务卿",
  "secretary of state marco rubio": "美国国务卿马尔科·鲁比奥",
  "marco rubio": "马可·鲁比奥",
  "capitol hill": "美国国会山",
  "spring heat wave": "春季热浪",
  "trump administration": "特朗普政府",
  "iran war": "伊朗战争",
  "negotiating on fumes": "在几乎没有余地的情况下谈判；勉强维持谈判",
  "midterm elections": "中期选举",
  "factor in": "把……考虑进去",
  "nearly three-month-old conflict": "这场近三个月的冲突",
  "cabinet meeting": "内阁会议",
  "expressed confidence": "表达信心",
  "a deal is near": "协议即将达成",
  "ebola cases": "埃博拉病例",
  "authorities in congo": "刚果当局",
  "struggle to": "艰难设法；努力去",
  "contain the outbreak": "控制疫情暴发",
  "set up cooling stations": "设立降温站点",
  "prompting officials to": "促使官员去……",
  "nuclear talks": "核谈判",
  optimistic: "乐观的",
  "potential for a resumption": "恢复的可能性",
  ceasefire: "停火；停战",
  "shaky ceasefire": "脆弱的停火",
  "in doubt": "前景存疑",
  "military escalation": "军事升级",
  communicating: "沟通；联络",
  "extending the ceasefire": "延长停火",
  "underground tunnel": "地下隧道",
  "federal investigators": "联邦调查人员",
  uncovered: "发现；查明",
  "southern california": "南加州",
  "drug cartel": "贩毒集团",
  "mexican drug cartel": "墨西哥贩毒集团",
  "peace talks": "和平谈判",
  "voice concerns": "表达担忧",
  "voiced concerns": "表达担忧",
  "dull america's edge": "削弱美国优势",
  "the claim": "这一说法",
  "disputed the claim": "质疑这一说法",
  "continuing talks": "继续进行的谈判",
  "major blow": "重大打击",
  lebanon: "黎巴嫩",
  iran: "伊朗",
  israel: "以色列",
  mexico: "墨西哥",
  cocaine: "可卡因",
  mediators: "调解人；斡旋者",
  "semiofficial": "半官方的",
  "semiofficial iranian news agencies": "伊朗半官方新闻机构",
  "grilled": "被严厉盘问",
  "resumption": "恢复；重新开始",
  "diplomatic efforts": "外交努力",
  "executive order on artificial intelligence": "关于人工智能的行政命令",
  "president donald trump": "美国总统唐纳德·特朗普",
  "israeli prime minister": "以色列总理",
  "israeli prime minister benjamin netanyahu": "以色列总理本雅明·内塔尼亚胡",
  "benjamin netanyahu": "本雅明·内塔尼亚胡",
  bahrain: "巴林",
  kuwait: "科威特",
  jordan: "约旦",
  maine: "缅因州",
  chicago: "芝加哥",
  "bill gates": "比尔·盖茨",
  "jeffrey epstein": "杰弗里·爱泼斯坦",
  "elon musk": "埃隆·马斯克",
  byd: "比亚迪",
  "president zelenskyy": "泽连斯基总统",
  "kyrylo budanov": "基里洛·布达诺夫",
  hadramout: "哈德拉毛",
  "susan collins": "苏珊·柯林斯",
  "iranian officials": "伊朗官员",
  "nuclear sites": "核设施地点",
  demonstrations: "示威活动",
  "electric vehicle maker": "电动汽车制造商",
  "tax breaks": "税收减免",
  "rising competition": "日益激烈的竞争",
  "military intelligence": "军事情报",
  "chief of staff": "幕僚长",
  "defense development": "国防发展",
  "saudi warplanes": "沙特战机",
  "separatist leader": "分离主义领导人",
  "southern yemen": "也门南部",
  "saudi-led operation": "沙特主导的行动",
  "southern transitional council": "南方过渡委员会",
  "military base": "军事基地",
  "attack helicopter": "攻击直升机",
  "democratic nomination": "民主党提名",
  "senate seat": "参议院席位",
  "high-stakes election": "高风险选举",
  credibility: "公信力；信誉",
  controversies: "争议；风波",
  "burning cross": "燃烧的十字架",
  "house committee": "众议院委员会",
  "behind closed doors": "闭门进行；不公开地",
  "serial killer": "连环杀手",
  attacked: "袭击了；攻击了",
  expletives: "脏话；咒骂语",
  perturbed: "不安的；烦恼的",
  criticizing: "批评；指责",
  admitted: "承认；坦言",
  disputed: "质疑；反驳",
  continuing: "持续进行",
  seized: "查获；扣押",
  vet: "审查；审核",
  threats: "威胁",
  protests: "抗议活动",
  bombings: "轰炸行动",
  missiles: "导弹",
  helicopter: "直升机",
  nomination: "提名",
  election: "选举",
  cross: "十字架",
  committee: "委员会",
  files: "档案；文件",
  oversight: "监督",
  intelligence: "情报",
  defense: "国防",
  development: "发展",
  operation: "行动",
  competition: "竞争",
  politics: "政治立场",
  scorching: "炙烤；灼热侵袭",
  scorch: "灼烧；炙烤",
  cooling: "降温",
  stations: "站点；服务点",
  delivered: "交付；交出了",
  invasion: "入侵",
  security: "安全",
  staff: "参谋班子；幕僚团队",
  warplanes: "军机；战机",
  targeted: "把……作为目标",
  forces: "部队；武装力量",
  leader: "领导人",
  camps: "营地",
};

const LOW_QUALITY_CHINESE_PATTERNS = [
  /^表示已发生的动作或状态$/,
  /^表示正在进行的动作或状态$/,
  /^过程；行动；机制$/,
  /^动作或状态$/,
  /^新闻语境中的常见表达$/,
  /^常见表达$/,
] as const;

const PRIORITY_HEURISTIC_PATTERNS = [
  /\blife in prison without parole\b/i,
  /\bwithout parole\b/i,
  /\bradicalized online\b/i,
  /\bwhite supremacist views\b/i,
  /\bwhite supremacist\b/i,
  /\bChinese President Xi Jinping\b/i,
  /\bPresident Xi Jinping\b/i,
  /\bXi Jinping\b/i,
  /\bRussian President Vladimir Putin\b/i,
  /\bPresident Vladimir Putin\b/i,
  /\bVladimir Putin\b/i,
  /\bPresident Donald Trump\b/i,
  /\bDonald Trump\b/i,
  /\bSan Diego\b/i,
  /\bVentura County\b/i,
  /\bLos Angeles\b/i,
  /\bSandy Fire\b/i,
  /\bevacuat(?:ion|e) orders\b/i,
  /\bRepublican primary\b/i,
  /\bThomas Massie\b/i,
  /\bCongressman Thomas Massie\b/i,
  /\btrade and international affairs\b/i,
  /\binternational affairs\b/i,
  /\bclose ties\b/i,
  /\bdry brush\b/i,
  /\bsquare miles\b/i,
  /\bPresident Trump\b/i,
  /\bPresident Volodymyr Zelenskyy\b/i,
  /\bVolodymyr Zelenskyy\b/i,
  /\bigniting a fire\b/i,
  /\boil depot\b/i,
  /\bdrones struck\b/i,
  /\bstruck an oil depot\b/i,
  /\bPetersburg\b/i,
  /\bexecutive order on artificial intelligence\b/i,
  /\bexecutive order\b/i,
  /\bfederal government\b/i,
  /\bartificial intelligence\b/i,
  /\badvanced AI systems\b/i,
  /\bnational security risks\b/i,
  /\bnational security\b/i,
  /\bpublic release\b/i,
  /\bvoiced concerns\b/i,
  /\bsimilar policy\b/i,
  /\bdull America's edge\b/i,
  /\bAmerica's edge\b/i,
  /\bAI technology\b/i,
  /\bdiplomatic efforts\b/i,
  /\bSecretary of State\b/i,
  /\bMarco Rubio\b/i,
  /\bCapitol Hill\b/i,
  /\bspring heat wave\b/i,
  /\bset up cooling stations\b/i,
  /\bprompting officials to\b/i,
  /\bTrump administration\b/i,
  /\bIran war\b/i,
  /\bnegotiating on fumes\b/i,
  /\bmidterm elections\b/i,
  /\bfactor in\b/i,
  /\bnearly three-month-old conflict\b/i,
  /\bCabinet meeting\b/i,
  /\bexpressed confidence\b/i,
  /\ba deal is near\b/i,
  /\bEbola cases\b/i,
  /\bauthorities in Congo\b/i,
  /\bstruggle to\b/i,
  /\bcontain the outbreak\b/i,
  /\boptimistic\b/i,
  /\bpotential for a resumption\b/i,
  /\bnuclear talks\b/i,
  /\bshaky ceasefire\b/i,
  /\bceasefire\b/i,
  /\bin doubt\b/i,
  /\bsemiofficial Iranian news agencies\b/i,
  /\bmediators\b/i,
  /\bextending the ceasefire\b/i,
  /\bmilitary escalation\b/i,
  /\bLebanon\b/i,
  /\bdisputed the claim\b/i,
  /\bcontinuing talks\b/i,
  /\bfederal investigators\b/i,
  /\buncovered\b/i,
  /\bunderground tunnel\b/i,
  /\bSouthern California\b/i,
  /\bseized\b/i,
  /\bmajor blow\b/i,
  /\bMexican drug cartel\b/i,
  /\bdrug cartel\b/i,
  /\bpeace talks\b/i,
  /\bsemiofficial\b/i,
  /\bgrilled\b/i,
  /\bresumption\b/i,
  /\bserial killer\b/i,
  /\bexpletives\b/i,
  /\bperturbed\b/i,
  /\bcriticizing\b/i,
  /\badmitted\b/i,
  /\bvet\b/i,
] as const;

const WEAK_HEURISTIC_CANDIDATES = new Set([
  "the president",
  "president voiced previous",
  "concerns that similar",
  "president trump disputed",
  "talks were continuing",
  "federal investigators have",
  "authorities described",
  "policy could dull",
  "powerful mexican drug",
  "underground tunnel stretching",
  "rubio said",
  "optimistic about",
  "million dollars worth",
  "president voiced",
  "president voiced previous concerns",
  "americas edge on ai",
  "could dull americas edge",
  "policy could dull americas",
  "could dull americas",
  "said talks were continuing",
  "trump disputed the claim",
  "uncovered an underground tunnel",
  "powerful mexican drug cartel",
  "discovery as a major",
  "blow to a powerful",
  "dull americas",
  "edge on ai technology",
  "edge on ai",
  "southern california and seized",
  "tunnel stretching from mexico",
  "mexico to southern california",
  "uncovered an underground",
  "stretching from mexico",
  "struck an oil",
  "oil depot near st",
  "depot near st",
  "president volodymyr",
  "fire president volodymyr zelenskyy",
  "previous",
  "voiced",
  "continuing",
  "similar",
  "technology",
  "federal",
  "investigators",
  "described",
  "discovery",
  "mexican",
  "authorities",
]);

const GENERIC_HEURISTIC_WORDS = new Set([
  "about",
  "after",
  "before",
  "their",
  "there",
  "which",
  "would",
  "could",
  "should",
  "must",
  "across",
  "created",
  "executives",
  "president",
  "donald",
  "trump",
  "israeli",
  "prime",
  "minister",
  "previous",
  "powerful",
  "policy",
  "concerns",
  "authorities",
  "similar",
  "technology",
  "federal",
  "investigators",
  "described",
  "discovery",
  "million",
  "dollars",
  "worth",
]);

const HEURISTIC_WORD_TRANSLATIONS: Record<string, string> = {
  administration: "政府",
  advanced: "先进的",
  agencies: "机构",
  agency: "机构",
  ai: "人工智能",
  america: "美国",
  americas: "美国的",
  a: "一个",
  an: "一个",
  and: "以及",
  after: "在……之后",
  asian: "亚洲的",
  association: "协会；联盟",
  arriving: "抵达",
  architect: "建筑师",
  are: "是",
  beach: "海滩",
  blow: "打击",
  been: "已经被",
  being: "正在被",
  board: "登上",
  bolster: "加强；提振",
  business: "商业；商务",
  center: "中心；焦点",
  conclusion: "结束；结论",
  convicted: "被定罪的",
  counts: "罪名；指控项",
  "co-founder": "联合创始人",
  computing: "计算",
  defendant: "被告",
  capitol: "国会山",
  ceasefire: "停火",
  day: "天",
  dismembered: "肢解",
  concerns: "担忧",
  depot: "仓库",
  diplomatic: "外交的",
  disputes: "争议",
  drones: "无人机",
  edge: "优势",
  escalation: "升级",
  executive: "行政的",
  face: "面临",
  federal: "联邦的",
  fire: "大火",
  files: "档案；文件",
  founder: "创始人",
  french: "法国的",
  geneva: "日内瓦",
  gilgo: "吉尔戈",
  government: "政府",
  has: "已经",
  hill: "山；国会山",
  helicopter: "直升机",
  hoyerman: "霍耶尔曼",
  house: "众议院；议会",
  hosted: "接待；主持",
  held: "举行",
  igniting: "引发",
  intelligence: "智能",
  in: "在",
  island: "岛",
  investigators: "调查人员",
  iran: "伊朗",
  is: "是",
  israeli: "以色列的",
  kazan: "喀山",
  killer: "杀手",
  lebanon: "黎巴嫩",
  leaders: "领导人",
  life: "生活；终身监禁",
  largest: "最大的",
  long: "长的",
  major: "重大",
  marco: "马可",
  marine: "海军陆战队的",
  meeting: "会议",
  mediators: "调解人",
  mexican: "墨西哥的",
  military: "军事的",
  mounting: "不断增加的",
  national: "国家的",
  nations: "国家",
  nuclear: "核",
  oil: "石油",
  one: "一号；一个",
  optimistic: "乐观的",
  order: "命令",
  other: "其他的",
  of: "……的",
  parole: "假释",
  paris: "巴黎",
  peace: "和平",
  petersburg: "彼得堡",
  policy: "政策",
  president: "总统",
  prime: "总理",
  prison: "监禁；监狱",
  pressure: "压力",
  prosecutor: "检察官",
  public: "公开的",
  putin: "普京",
  quantum: "量子",
  release: "发布",
  reported: "报道",
  rex: "雷克斯",
  respond: "回应",
  resumption: "恢复",
  returns: "返回；重返",
  risks: "风险",
  rubio: "鲁比奥",
  security: "安全",
  secret: "秘密的",
  seeks: "试图",
  seen: "被看到",
  semiofficial: "半官方的",
  southeast: "东南亚的",
  seized: "查获",
  secretary: "国务卿",
  sentenced: "判处",
  serial: "连环的",
  sex: "性",
  similar: "类似的",
  southern: "南部的",
  spa: "温泉",
  stage: "舞台；焦点",
  state: "国务",
  strangled: "勒死",
  attack: "袭击；攻击",
  struck: "袭击",
  talks: "谈判",
  the: "这；该",
  technology: "技术",
  tech: "科技",
  testifies: "作证",
  testify: "作证",
  ties: "关系；联系",
  taking: "正在变得；正在进行",
  to: "去；用于",
  town: "城镇",
  two: "两",
  versailles: "凡尔赛",
  viva: "维瓦",
  vladimir: "弗拉基米尔",
  volga: "伏尔加河",
  without: "没有；无",
  workers: "工作者",
  tunnel: "隧道",
  underground: "地下的",
  vet: "审查",
  voiced: "表达",
  volodymyr: "弗拉基米尔",
  zelenskyy: "泽连斯基",
};

const PHRASE_EDGE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "all",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "by",
  "each",
  "every",
  "for",
  "from",
  "he",
  "her",
  "his",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "those",
  "to",
  "until",
  "was",
  "when",
  "whether",
  "while",
  "were",
  "with",
  "say",
  "says",
  "said",
  "reported",
  "reports",
  "called",
  "calls",
]);

function normalizeModelOverride(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return getArkModelOption(normalized);
}

function normalizeBaseUrlOverride(value: string, fallbackBaseUrl: string) {
  const normalized = value.trim();
  if (!normalized) {
    return fallbackBaseUrl;
  }

  try {
    const candidateUrl = new URL(normalized);

    if (candidateUrl.protocol !== "https:") {
      return fallbackBaseUrl;
    }

    return candidateUrl.toString().replace(/\/$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

function extractJsonPayload(content: unknown) {
  const safeContent = coerceToString(content);
  const fenced = safeContent.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }

  const start = safeContent.indexOf("{");
  const end = safeContent.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return safeContent.slice(start, end + 1);
  }

  return safeContent;
}

function normalizeEntries(entries: Array<Omit<RecognitionEntry, "id">>) {
  return entries.map((entry, index) => ({
    id: `entry-${Date.now()}-${index}`,
    sentence: entry.sentence,
    vocabulary: entry.vocabulary,
    chinese: entry.chinese,
    example: entry.example,
    pronunciation:
      entry.pronunciation || `${entry.vocabulary}. ${entry.example}. ${entry.sentence}`,
    partOfSpeech: entry.partOfSpeech?.trim() || "",
    sentenceChinese: entry.sentenceChinese?.trim() || "",
    exampleChinese: entry.exampleChinese?.trim() || "",
    difficulty: entry.difficulty?.trim() || "",
    category: entry.category ?? "learning",
  }));
}

function coerceToString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeSentence(value: unknown) {
  return coerceToString(value).replace(/\s+/g, " ").trim();
}

function collapseRepeatedSentenceFragments(value: unknown) {
  const normalized = normalizeSentence(value)
    .replace(/\s*<[^>\n]{1,24}\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const repeatedClausePattern =
    /(.{24,}?\b[A-Za-z][A-Za-z'-]*\b)\s+(?:<[^>\n]{1,24}\s+)?\1(?=[\s,.;:!?]|$)/i;
  let collapsed = normalized;

  for (let index = 0; index < 3; index += 1) {
    const next = collapsed.replace(repeatedClausePattern, "$1");
    if (next === collapsed) {
      break;
    }
    collapsed = next.trim();
  }

  return collapsed
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVocabulary(value: unknown) {
  return coerceToString(value)
    .replace(/[“”’']/g, "")
    .replace(/[.,;:!?()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSentenceForComparison(value: unknown) {
  return coerceToString(value)
    .replace(/[“”‘’"']/g, "")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findTranscriptEntryPosition(transcript: string, sentence: string, vocabulary: string) {
  const normalizedTranscript = normalizeSentenceForComparison(transcript);
  const normalizedSentence = normalizeSentenceForComparison(sentence);
  const normalizedVocabulary = normalizeSentenceForComparison(vocabulary);

  const sentenceIndex =
    normalizedSentence.length > 0
      ? normalizedTranscript.indexOf(normalizedSentence)
      : -1;
  const vocabularyIndex =
    normalizedVocabulary.length > 0
      ? normalizedTranscript.indexOf(normalizedVocabulary)
      : -1;

  return {
    sentenceIndex: sentenceIndex >= 0 ? sentenceIndex : Number.MAX_SAFE_INTEGER,
    vocabularyIndex:
      vocabularyIndex >= 0 ? vocabularyIndex : Number.MAX_SAFE_INTEGER,
  };
}

function getSentenceOrderIndexMap(transcript: string) {
  return new Map(
    Array.from(new Set(splitTranscriptSentences(transcript))).map((sentence, index) => [
      normalizeSentenceForComparison(sentence),
      index,
    ]),
  );
}

function sortEntriesByTranscriptOrder(transcript: string, entries: StructuredEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftPosition = findTranscriptEntryPosition(
        transcript,
        left.entry.sentence,
        left.entry.vocabulary,
      );
      const rightPosition = findTranscriptEntryPosition(
        transcript,
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

function buildPreview(value: string, limit = 240) {
  const normalized = normalizeSentence(value).replace(/\n+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

function countTranscriptLines(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function buildStageDiagnostics(rawText: string, cleanedText: string): ImageStageDiagnostics | null {
  const comparable = cleanedText || rawText;
  if (!comparable) {
    return null;
  }

  return {
    rawLength: rawText.length,
    cleanedLength: cleanedText.length,
    lineCount: countTranscriptLines(rawText || cleanedText),
    sentenceCount: splitTranscriptSentences(cleanedText).length,
    preview: buildPreview(cleanedText || rawText),
  };
}

function mergeTranscriptVariants(...variants: string[]) {
  const mergedSentences: string[] = [];
  const seen = new Set<string>();

  for (const variant of variants) {
    for (const sentence of splitTranscriptSentences(variant)) {
      const cleanedSentence = collapseRepeatedSentenceFragments(sentence);
      const key = normalizeSentenceForComparison(cleanedSentence);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      mergedSentences.push(cleanedSentence);
    }
  }

  return mergedSentences.join(" ").trim();
}

const NORMALIZED_HEURISTIC_CHINESE_GLOSSARY = Object.fromEntries(
  Object.entries(HEURISTIC_CHINESE_GLOSSARY).map(([key, value]) => [
    normalizeVocabulary(key).toLowerCase(),
    value,
  ]),
);

function lookupHeuristicChinese(vocabulary: string) {
  const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
  const directMatch = NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalizedVocabulary];
  if (directMatch) {
    return directMatch;
  }

  if (/^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}$/.test(vocabulary)) {
    return composeHeuristicChinese(vocabulary);
  }

  if (
    /\b(?:Hill|Assembly|Department|Court|University|Agency|Council|Administration)\b/.test(
      vocabulary,
    )
  ) {
    return composeHeuristicChinese(vocabulary);
  }

  if (normalizedVocabulary.endsWith("tion")) {
    return "过程；行动；机制";
  }

  if (normalizedVocabulary.endsWith("ed")) {
    const inflectedMatch = lookupInflectedWordChinese(normalizedVocabulary);
    if (inflectedMatch) {
      return inflectedMatch;
    }
  }

  if (normalizedVocabulary.endsWith("ing")) {
    const inflectedMatch = lookupInflectedWordChinese(normalizedVocabulary);
    if (inflectedMatch) {
      return inflectedMatch;
    }
    return composeHeuristicChinese(vocabulary);
  }

  if (countWords(vocabulary) >= 2) {
    return composeHeuristicChinese(vocabulary);
  }

  return composeHeuristicChinese(vocabulary);
}

function createHeuristicExample(vocabulary: string) {
  const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
  const exampleMap: Record<string, string> = {
    "san diego": "San Diego remains one of the busiest border-region cities in the United States.",
    mosque: "Volunteers gathered outside the mosque before evening prayers began.",
    radicalized: "Police said the suspect was radicalized through extremist online forums.",
    "radicalized online":
      "Investigators believe several teenagers were radicalized online over a short period.",
    "white supremacist": "The group was linked to a white supremacist movement online.",
    "white supremacist views":
      "Teachers reported concern after the student began sharing white supremacist views.",
    shooting: "Two witnesses described the chaos that followed the shooting downtown.",
    "xi jinping": "Xi Jinping met foreign leaders in Beijing during the state visit.",
    "president xi jinping":
      "President Xi Jinping delivered remarks before the bilateral meeting started.",
    "chinese president xi jinping":
      "Chinese President Xi Jinping welcomed the delegation at the Great Hall of the People.",
    "vladimir putin": "Vladimir Putin arrived in Beijing for high-level talks with Chinese officials.",
    "president vladimir putin":
      "President Vladimir Putin met senior officials after landing in the capital.",
    "russian president vladimir putin":
      "Russian President Vladimir Putin praised deeper cooperation during the visit.",
    beijing: "Beijing hosted several major diplomatic meetings this week.",
    putin: "Putin appeared alongside senior officials during the ceremony.",
    "donald trump": "Donald Trump addressed supporters after the primary results were announced.",
    "close ties": "The two countries have maintained close ties for decades.",
    "trade and international affairs":
      "The summit focused on trade and international affairs across the region.",
    "international affairs":
      "She studied international affairs before joining the foreign ministry.",
    congressman: "The congressman spoke to local reporters after the vote.",
    "thomas massie": "Thomas Massie has often broken with party leaders on spending issues.",
    "congressman thomas massie":
      "Congressman Thomas Massie defended his position during a radio interview.",
    kentucky: "Kentucky voters turned out in large numbers for the primary election.",
    "republican primary":
      "The Republican primary drew national attention because of the former president's endorsement.",
    critic: "She became a vocal critic of the company's leadership after the layoffs.",
    "trump critic": "The senator was known as a frequent Trump critic within the party.",
    "evacuation orders":
      "Officials expanded evacuation orders as the wildfire moved toward nearby homes.",
    "ventura county":
      "Emergency crews were deployed across Ventura County as the winds strengthened.",
    california: "California firefighters faced another day of hot, dry weather.",
    "los angeles": "Los Angeles prepared additional shelters for displaced residents.",
    "sandy fire": "The Sandy Fire spread quickly through dry grass overnight.",
    "square miles": "The fire had already burned several square miles by sunrise.",
    "dry brush": "Strong winds pushed the flames through dry brush near the highway.",
    "president volodymyr zelenskyy":
      "President Volodymyr Zelenskyy addressed the public after the attack.",
    "volodymyr zelenskyy":
      "Volodymyr Zelenskyy spoke to reporters after the emergency meeting.",
    petersburg: "Residents in Petersburg reported hearing several loud blasts overnight.",
    "igniting a fire": "The blast hit a fuel tank, igniting a fire that burned through the night.",
    "oil depot": "The explosion damaged an oil depot on the edge of the city.",
    "drones struck": "Witnesses said drones struck several targets before dawn.",
    "struck an oil depot": "Officials said the attack struck an oil depot near the highway.",
    grill: "We plan to grill fresh vegetables and chicken in the backyard tonight.",
    backlash: "The company faced immediate backlash after announcing the price increase.",
    "executive order on artificial intelligence":
      "The White House issued a new executive order on artificial intelligence to guide federal agencies.",
    "executive order": "The president signed an executive order to tighten border controls.",
    "artificial intelligence": "Many universities are expanding their artificial intelligence programs.",
    "advanced ai systems": "Researchers are debating how to regulate advanced AI systems.",
    "national security risks": "Lawmakers warned about the national security risks of the merger.",
    "ai technology": "Startups are racing to apply AI technology in healthcare.",
    "america's edge": "Officials said the new investment would help preserve America's edge in innovation.",
    "dull america's edge": "Critics argued that excessive regulation could dull America's edge in chip design.",
    "similar policy": "Several experts warned that a similar policy could hurt small exporters.",
    "national security": "Officials said the policy change was necessary for national security.",
    "marco rubio": "Marco Rubio spoke to reporters after the Senate hearing ended.",
    "capitol hill": "The proposal faced immediate criticism on Capitol Hill.",
    "nuclear talks": "Diplomats hope nuclear talks will resume before the end of the month.",
    "potential for a resumption":
      "Diplomats still see the potential for a resumption of formal talks.",
    ceasefire: "Both sides agreed to a temporary ceasefire after weeks of fighting.",
    "shaky ceasefire": "Aid groups were preparing for more violence despite the shaky ceasefire.",
    "in doubt": "With no agreement in sight, the project's future remained in doubt.",
    "military escalation": "Regional leaders warned that any military escalation could trigger a wider conflict.",
    "underground tunnel": "Police discovered an underground tunnel beneath the abandoned warehouse.",
    "drug cartel": "The government launched a major operation against the drug cartel.",
    "peace talks": "International mediators pushed both sides back to peace talks.",
    mediators: "Neutral mediators helped the two companies reach an agreement.",
    semiofficial: "The report first appeared in a semiofficial news outlet.",
    grilled: "The minister was grilled by lawmakers over the sudden policy reversal.",
    resumption: "Investors welcomed the resumption of direct flights between the two cities.",
    "diplomatic efforts": "The president praised his team's diplomatic efforts in the region.",
    expletives: "The live broadcast was delayed after the guest used several expletives.",
    perturbed: "She looked perturbed when the meeting was suddenly canceled.",
    criticizing: "Several analysts are criticizing the company for its slow response.",
    admitted: "The official admitted that the early forecast had been too optimistic.",
    "federal investigators": "Federal investigators searched the site late Friday night.",
    uncovered: "Reporters uncovered new evidence after reviewing court records.",
    seized: "Customs officers seized thousands of counterfeit products at the port.",
    vet: "The agency will vet every application before making a final decision.",
    voiced: "Several senators voiced concern over the pace of the reform.",
    previous: "Her previous employer was a large international bank.",
    disputed: "The company disputed the claims in the media report.",
    continuing: "Despite the delays, negotiations are continuing behind closed doors.",
    "major blow": "The court ruling dealt a major blow to the opposition party.",
    "southern california": "Wildfires spread quickly across parts of Southern California.",
  };

  if (exampleMap[normalizedVocabulary]) {
    return exampleMap[normalizedVocabulary];
  }

  if (/^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}\s+Fire$/.test(vocabulary)) {
    return `Firefighters worked through the night to contain the ${vocabulary}.`;
  }

  if (
    /^(?:President|Prime Minister|Secretary of State|Congressman)\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2}$/.test(
      vocabulary,
    )
  ) {
    return `${vocabulary} spoke to reporters after the meeting ended.`;
  }

  if (/^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}$/.test(vocabulary)) {
    return `${vocabulary} remained in the national spotlight throughout the week.`;
  }

  if (/^[A-Z][A-Za-z-]{2,}$/.test(vocabulary)) {
    return `${vocabulary} remained at the center of the latest regional update.`;
  }

  if (normalizedVocabulary.endsWith("ed")) {
    return `Officials said the issue remained ${vocabulary} after the late-night announcement.`;
  }

  if (normalizedVocabulary.endsWith("ing")) {
    return `Analysts are still ${vocabulary} the broader impact of the policy change.`;
  }

  if (normalizedVocabulary.endsWith("tion") || normalizedVocabulary.endsWith("sion")) {
    return `The report focused on ${vocabulary} across several key sectors.`;
  }

  if (countWords(vocabulary) >= 2) {
    return `Analysts highlighted ${vocabulary} as a key part of the latest developments.`;
  }

  if (isAdvancedStandaloneWord(vocabulary)) {
    return `The article used ${vocabulary} to describe the scale of the situation.`;
  }

  if (HEURISTIC_WORD_TRANSLATIONS[normalizedVocabulary]) {
    return `Analysts used ${vocabulary} to explain the latest turn of events.`;
  }

  return "";
}

function createHeuristicSecondaryExample(vocabulary: string) {
  const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
  const exampleMap: Record<string, string> = {
    mosque: "Local families donated food to the mosque after the attack.",
    radicalized: "Several young men were radicalized before anyone noticed the warning signs.",
    "white supremacist views":
      "Investigators later confirmed that he had been posting white supremacist views online.",
    "xi jinping": "Xi Jinping emphasized long-term cooperation during the summit.",
    "vladimir putin": "Vladimir Putin met business leaders before returning to Moscow.",
    "donald trump": "Donald Trump campaigned heavily in the final week before the vote.",
    "thomas massie": "Thomas Massie continued to criticize the party's spending bill.",
    "republican primary":
      "Several candidates spent millions of dollars competing in the Republican primary.",
    "ventura county": "Residents in Ventura County were warned to leave before nightfall.",
    "los angeles": "Smoke from the fire drifted toward Los Angeles by the afternoon.",
    "sandy fire": "The Sandy Fire forced several schools to close for the day.",
    "dry brush": "Crews cleared dry brush to slow the spread of the wildfire.",
    grilled: "Reporters grilled the spokesperson over the missing documents.",
    "igniting a fire": "Sparks from the generator ignited a fire in the storage room.",
    "oil depot": "Security forces sealed off the oil depot after the explosion.",
    "drones struck": "Military officials said drones struck the radar station before dawn.",
    grill: "My uncle likes to grill fish over charcoal on summer evenings.",
    backlash: "The mayor tried to calm the backlash by holding a public meeting.",
    "volodymyr zelenskyy":
      "Volodymyr Zelenskyy met foreign leaders to discuss additional military aid.",
    "president volodymyr zelenskyy":
      "President Volodymyr Zelenskyy urged allies to speed up air-defense deliveries.",
  };

  if (exampleMap[normalizedVocabulary]) {
    return exampleMap[normalizedVocabulary];
  }

  if (
    /^(?:President|Prime Minister|Secretary of State|Congressman)\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2}$/.test(
      vocabulary,
    )
  ) {
    return `${vocabulary} answered several questions before leaving the venue.`;
  }

  if (/^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}$/.test(vocabulary)) {
    return `${vocabulary} drew fresh attention after the latest developments were reported.`;
  }

  if (/^[A-Z][A-Za-z-]{2,}$/.test(vocabulary)) {
    return `Officials in ${vocabulary} are expected to respond in the coming days.`;
  }

  if (countWords(vocabulary) >= 2) {
    return `Observers said ${vocabulary} would remain an important issue in the coming weeks.`;
  }

  if (normalizedVocabulary.endsWith("ed")) {
    return `Several officials appeared ${vocabulary} as the story continued to unfold.`;
  }

  if (normalizedVocabulary.endsWith("ing")) {
    return `The minister kept ${vocabulary} the policy despite growing criticism.`;
  }

  if (isAdvancedStandaloneWord(vocabulary)) {
    return `Students often remember ${vocabulary} more easily when it appears in real news coverage.`;
  }

  if (HEURISTIC_WORD_TRANSLATIONS[normalizedVocabulary]) {
    return `Teachers often use ${vocabulary} as a useful example in current-affairs reading.`;
  }

  return "";
}

function countWords(value: string) {
  return normalizeVocabulary(value)
    .split(" ")
    .filter(Boolean).length;
}

function lookupInflectedWordChinese(normalizedVocabulary: string) {
  const baseForms: string[] = [];

  if (normalizedVocabulary.endsWith("ed")) {
    baseForms.push(normalizedVocabulary.slice(0, -2));
    baseForms.push(normalizedVocabulary.slice(0, -1));
    if (normalizedVocabulary.endsWith("ied")) {
      baseForms.push(`${normalizedVocabulary.slice(0, -3)}y`);
    }
  }

  if (normalizedVocabulary.endsWith("ing")) {
    baseForms.push(normalizedVocabulary.slice(0, -3));
    if (normalizedVocabulary.length > 4) {
      baseForms.push(`${normalizedVocabulary.slice(0, -3)}e`);
    }
  }

  for (const baseForm of baseForms.filter(Boolean)) {
    const directMatch = NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[baseForm];
    if (directMatch) {
      return directMatch;
    }

    const wordMatch = HEURISTIC_WORD_TRANSLATIONS[baseForm];
    if (wordMatch) {
      return wordMatch;
    }
  }

  return "";
}

function composeHeuristicChinese(vocabulary: string) {
  const normalizedWords = tokenizeVocabularyWords(normalizeVocabulary(vocabulary).toLowerCase());
  if (normalizedWords.length === 0) {
    return normalizeVocabulary(vocabulary);
  }

  const translatedWords = normalizedWords.map(
    (word) => HEURISTIC_WORD_TRANSLATIONS[word] ?? word,
  );

  return translatedWords.join("、");
}

function tokenizeVocabularyWords(value: string) {
  return value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? [];
}

function normalizeSearchTerm(value: string) {
  return normalizeVocabulary(value).toLowerCase();
}

function buildSearchVariants(term: string) {
  const normalized = normalizeSearchTerm(term);
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

function isLikelyOcrNoiseWord(word: string) {
  return (
    word.length <= 2 ||
    /[0-9@%&]/.test(word) ||
    /^[A-Z]{2,}$/.test(word) ||
    /^(?:app|vercelapp|cache|bor|eel|abner|tit|ped|iia|gn|sa|lj|im|re)$/i.test(word)
  );
}

function isLikelyOcrNoiseSentence(sentence: string) {
  const words = tokenizeVocabularyWords(sentence);
  if (words.length < 3) {
    return true;
  }

  const noiseWordCount = words.filter(isLikelyOcrNoiseWord).length;
  const alphaOnlyCount = words.filter((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word)).length;
  const alphaRatio = alphaOnlyCount / Math.max(words.length, 1);

  return noiseWordCount >= Math.ceil(words.length / 2) || alphaRatio < 0.65;
}

function isAdvancedStandaloneWord(word: string) {
  const normalized = word.toLowerCase();
  if (GENERIC_HEURISTIC_WORDS.has(normalized)) {
    return false;
  }

  if (
    [
      "administration",
      "affairs",
      "ceasefire",
      "committee",
      "communicating",
      "co-founder",
      "cooling",
      "credibility",
      "criticizing",
      "controversies",
      "demonstrations",
      "diplomatic",
      "election",
      "escalation",
      "evacuation",
      "expletives",
      "founder",
      "grilled",
      "helicopter",
      "intelligence",
      "investigating",
      "mediators",
      "nomination",
      "operation",
      "optimistic",
      "perturbed",
      "politics",
      "radicalized",
      "resumption",
      "scorch",
      "scorching",
      "separatist",
      "shooting",
      "semiofficial",
      "supremacist",
      "testifies",
      "testify",
      "uncovered",
      "seized",
      "vet",
      "wildfire",
    ].includes(normalized)
  ) {
    return true;
  }

  return (
    (Boolean(HEURISTIC_WORD_TRANSLATIONS[normalized]) && normalized.length >= 7) ||
    (normalized.length >= 8 &&
      /(tion|tions|sion|sions|ment|ments|ance|ances|ence|ences|ality|alities|ative|atives|izing|ating|ized|edly|fully|ship|ships|tive|tives)$/.test(
        normalized,
      ))
  );
}

function extractContextualChunks(sentence: string) {
  const words = tokenizeVocabularyWords(sentence);
  const chunks: string[] = [];

  const pushWindowChunk = (start: number, end: number) => {
    const phraseWords = words.slice(start, end + 1);
    if (phraseWords.length < 2) {
      return;
    }

    const firstWord = phraseWords[0]?.toLowerCase() ?? "";
    const lastWord = phraseWords.at(-1)?.toLowerCase() ?? "";
    if (PHRASE_EDGE_STOPWORDS.has(firstWord) || PHRASE_EDGE_STOPWORDS.has(lastWord)) {
      return;
    }

    chunks.push(phraseWords.join(" "));
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const normalized = word.toLowerCase();
    const previous = words[index - 1];
    const next = words[index + 1];
    const isAnchor =
      isAdvancedStandaloneWord(word) ||
      Boolean(HEURISTIC_WORD_TRANSLATIONS[normalized]) ||
      Boolean(NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalized]) ||
      /ing$|ed$|tion$|sion$|ment$|ship$/.test(normalized) ||
      word.includes("-");

    if (!isAnchor) {
      continue;
    }

    chunks.push(word);

    if (previous && !PHRASE_EDGE_STOPWORDS.has(previous.toLowerCase()) && previous.length >= 3) {
      chunks.push(`${previous} ${word}`);
    }

    if (next && !PHRASE_EDGE_STOPWORDS.has(next.toLowerCase()) && next.length >= 3) {
      chunks.push(`${word} ${next}`);
    }

    if (
      previous &&
      next &&
      !PHRASE_EDGE_STOPWORDS.has(previous.toLowerCase()) &&
      !PHRASE_EDGE_STOPWORDS.has(next.toLowerCase()) &&
      previous.length >= 3 &&
      next.length >= 3
    ) {
      chunks.push(`${previous} ${word} ${next}`);
    }

    for (let start = Math.max(0, index - 2); start <= index; start += 1) {
      for (let end = index; end <= Math.min(words.length - 1, index + 3); end += 1) {
        if (end - start + 1 > 6) {
          continue;
        }
        pushWindowChunk(start, end);
      }
    }
  }

  const infinitiveChunks = Array.from(
    sentence.matchAll(
      /\b([A-Za-z-]+ing\s+[A-Za-z-]+(?:\s+[A-Za-z-]+)?\s+to)\s+([A-Za-z-]+(?:\s+[A-Za-z-]+){1,4})\b/g,
    ),
  );
  for (const match of infinitiveChunks) {
    const leadingChunk = normalizeVocabulary(match[1] ?? "");
    const trailingChunk = normalizeVocabulary(match[2] ?? "");
    if (countWords(leadingChunk) >= 2) {
      chunks.push(leadingChunk);
    }
    if (countWords(trailingChunk) >= 2) {
      chunks.push(trailingChunk);
    }
  }

  const bareInfinitiveChunks = Array.from(
    sentence.matchAll(/\bto\s+([A-Za-z-]+(?:\s+[A-Za-z-]+){1,4})\b/g),
  );
  for (const match of bareInfinitiveChunks) {
    const chunk = normalizeVocabulary(match[1] ?? "");
    if (countWords(chunk) >= 2) {
      chunks.push(chunk);
    }
  }

  const copulaChunks = Array.from(
    sentence.matchAll(
      /\b([A-Za-z-]+(?:\s+[A-Za-z-]+){1,3})\s+(?:is|are|was|were)\s+([A-Za-z-]+ing|[A-Za-z-]+ed|[A-Za-z-]+)\b/gi,
    ),
  );
  for (const match of copulaChunks) {
    const subjectChunk = normalizeVocabulary(match[1] ?? "");
    const predicateChunk = normalizeVocabulary(match[2] ?? "");
    if (countWords(subjectChunk) >= 2) {
      chunks.push(subjectChunk);
    }
    if (isAdvancedStandaloneWord(predicateChunk) || HEURISTIC_WORD_TRANSLATIONS[predicateChunk.toLowerCase()]) {
      chunks.push(predicateChunk);
    }
  }

  const quotedChunks = Array.from(sentence.matchAll(/"([^"\n]{4,48})"/g));
  for (const match of quotedChunks) {
    const chunk = normalizeVocabulary(match[1] ?? "");
    if (countWords(chunk) >= 2) {
      chunks.push(chunk);
    }
  }

  const classroomPatterns = [
    /\bset up cooling stations\b/gi,
    /\bprompting officials to\b/gi,
    /\bspring heat wave\b/gi,
    /\bmidterm elections\b/gi,
    /\bfactor in\b/gi,
    /\bnearly three-month-old conflict\b/gi,
    /\bCabinet meeting\b/gi,
    /\bexpressed confidence\b/gi,
    /\ba deal is near\b/gi,
    /\bSecretary of State\b/gi,
    /\bEbola cases\b/gi,
    /\bauthorities in Congo\b/gi,
    /\bstruggle to\b/gi,
    /\bcontain the outbreak\b/gi,
    /\bserial killer\b/gi,
  ];

  for (const pattern of classroomPatterns) {
    const matches = sentence.match(pattern) ?? [];
    for (const match of matches) {
      chunks.push(normalizeVocabulary(match));
    }
  }

  return chunks;
}

function isProperNounLikeCandidate(value: string) {
  return (
    /^(?:President|Prime Minister|Secretary of State|Congressman)\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,3}$/.test(
      value,
    ) ||
    /^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,4}$/.test(value)
  );
}

function shouldCollapseToLongestProperNounVariant(shorter: string, longer: string) {
  const normalizedShorter = normalizeVocabulary(shorter).toLowerCase();
  const normalizedLonger = normalizeVocabulary(longer).toLowerCase();
  if (
    !normalizedShorter ||
    !normalizedLonger ||
    normalizedShorter === normalizedLonger ||
    !isProperNounLikeCandidate(shorter) ||
    !isProperNounLikeCandidate(longer)
  ) {
    return false;
  }

  if (
    normalizedLonger.includes(normalizedShorter) &&
    countWords(longer) > countWords(shorter)
  ) {
    return true;
  }

  return false;
}

function wordOverlapRatio(left: string, right: string) {
  const leftWords = tokenizeVocabularyWords(normalizeVocabulary(left).toLowerCase());
  const rightWords = tokenizeVocabularyWords(normalizeVocabulary(right).toLowerCase());
  if (leftWords.length === 0 || rightWords.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftWords);
  const matched = rightWords.filter((word) => leftSet.has(word)).length;
  return matched / Math.max(Math.min(leftWords.length, rightWords.length), 1);
}

function shouldPreferStandaloneWordAlongsidePhrase(shorter: string, longer: string) {
  const normalizedShorter = normalizeVocabulary(shorter).toLowerCase();
  const normalizedLonger = normalizeVocabulary(longer).toLowerCase();
  const shorterWords = tokenizeVocabularyWords(normalizedShorter);
  const longerWords = tokenizeVocabularyWords(normalizedLonger);

  if (shorterWords.length !== 1 || longerWords.length < 3) {
    return false;
  }

  if (!isAdvancedStandaloneWord(shorterWords[0] ?? "")) {
    return false;
  }

  if (
    normalizedLonger.startsWith(`${normalizedShorter} `) ||
    normalizedLonger.endsWith(` ${normalizedShorter}`) ||
    normalizedLonger === normalizedShorter
  ) {
    return false;
  }

  return true;
}

function scoreHeuristicCandidate(candidate: string, sentence: string) {
  const normalized = normalizeVocabulary(candidate).toLowerCase();
  if (!normalized || WEAK_HEURISTIC_CANDIDATES.has(normalized)) {
    return -1000;
  }

  const words = tokenizeVocabularyWords(candidate);
  if (words.length === 0) {
    return -1000;
  }

  if (words.some((word) => word.length === 1 && word.toLowerCase() !== "a")) {
    return -1000;
  }

  if (words.filter((word) => /^[A-Z]/.test(word)).length > 0) {
    const hasLowerPhraseAfterProperNoun =
      /^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+)*\s+[a-z]+(?:\s+[a-z]+){1,3}$/.test(candidate);
    if (hasLowerPhraseAfterProperNoun) {
      return -1000;
    }
  }

  if (/\b[a-z]+\b.*\b[A-Z][A-Za-z-]+\b/.test(candidate) && !/^President\s+[A-Z]/.test(candidate)) {
    return -1000;
  }

  const firstWord = words[0]?.toLowerCase() ?? "";
  const lastWord = words.at(-1)?.toLowerCase() ?? "";
  let score = 0;

  if (NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalized]) {
    score += 120;
  }

  if (HEURISTIC_WORD_TRANSLATIONS[normalized]) {
    score += 48;
  }

  for (const pattern of PRIORITY_HEURISTIC_PATTERNS) {
    const match = sentence.match(pattern)?.[0];
    if (match && normalizeVocabulary(match).toLowerCase() === normalized) {
      score += 85;
      break;
    }
  }

  if (/^(?:President|Prime Minister|Secretary of State)\b/.test(candidate)) {
    score += 60;
  }

  if (/^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}$/.test(candidate)) {
    score += 55;
  }

  if (/^[A-Z][A-Za-z-]{2,}$/.test(candidate) && NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalized]) {
    score += 42;
  }

  if (candidate.includes("'s")) {
    score += 18;
  }

  if (words.length >= 2) {
    score += 20 + words.length * 8;
  } else if (isAdvancedStandaloneWord(candidate)) {
    score += 28;
  } else {
    score -= 30;
  }

  if (PHRASE_EDGE_STOPWORDS.has(firstWord) || PHRASE_EDGE_STOPWORDS.has(lastWord)) {
    score -= 25;
  }

  if (/^president\b/i.test(candidate) && !/^President\s+[A-Z]/.test(candidate)) {
    score -= 55;
  }

  if (/^rubio said\b/i.test(candidate)) {
    score -= 45;
  }

  if (/\b(?:has|have|had)\s+been\b/i.test(candidate) && words.length >= 3) {
    score -= 140;
  }

  if (/\b(?:is|are|was|were)\s+being\b/i.test(candidate) && words.length >= 3) {
    score -= 150;
  }

  if (/\b(?:is|are|was|were)\b/i.test(candidate) && words.length >= 4) {
    score -= 85;
  }

  const toIndex = words.findIndex((word) => word.toLowerCase() === "to");
  if (
    toIndex > 0 &&
    toIndex < words.length - 1 &&
    !words[0]?.toLowerCase().endsWith("ing") &&
    !HEURISTIC_WORD_TRANSLATIONS[(words[0] ?? "").toLowerCase()] &&
    !isAdvancedStandaloneWord(words[0] ?? "")
  ) {
    score -= 95;
  }

  if (
    /^(?:[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2}|President\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2})\s+(?:said|left|hosted|admitted|welcomed|praised|arrived|returns?)\b/.test(
      candidate,
    )
  ) {
    score -= 140;
  }

  if (/^(?:after|before|during|inside|outside|across|around|throughout)\s+the\s+[a-z-]+$/i.test(candidate)) {
    score -= 65;
  }

  if (/^(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+[a-z-]+$/i.test(candidate)) {
    score -= 80;
  }

  if (/^[A-Z][a-z-]+\s+(?:helicopter|meeting|town|leaders|technology|computing)$/i.test(candidate)) {
    score -= 90;
  }

  const genericWordCount = words.filter((word) => GENERIC_HEURISTIC_WORDS.has(word.toLowerCase())).length;
  const stopwordCount = words.filter((word) => PHRASE_EDGE_STOPWORDS.has(word.toLowerCase())).length;
  score -= genericWordCount * 8;
  if (words.length >= 3 && stopwordCount >= 2) {
    score -= 45;
  }
  if (/^(?:said|reported|described|allowed|stopped|have|was|were)\b/i.test(candidate)) {
    score -= 45;
  }

  if (
    /^(?:officials|authorities|leaders|groups|people|analysts|lawmakers)\s+to\b/i.test(candidate)
  ) {
    score -= 135;
  }

  if (/\b(?:to|being|been|have|has|had)$/i.test(candidate)) {
    score -= 160;
  }
  if (/\b(?:could|would|have|was|were|that)\b/i.test(candidate) && !NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalized]) {
    score -= 22;
  }

  if (/\b(?:Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Monday)\b/i.test(candidate)) {
    score -= 18;
  }

  if (/\$\d|million|dollars?/i.test(candidate)) {
    score -= 22;
  }

  if (/^[A-Z]{2,}(?:\s+[A-Z]{2,})+$/.test(candidate)) {
    score -= 200;
  }

  if (/^(?:this|he|she|they|it|we|i)\b/i.test(candidate)) {
    score -= 120;
  }

  if (
    /\blife in prison without parole\b/i.test(sentence) &&
    /\bsentenced to life\b/i.test(candidate) &&
    !/\blife in prison without parole\b/i.test(candidate)
  ) {
    score -= 95;
  }

  if (normalized === normalizedSentenceFallback(sentence)) {
    score -= 10;
  }

  return score;
}

function normalizedSentenceFallback(sentence: string) {
  return normalizeVocabulary(sentence).toLowerCase();
}

function isAwkwardHeuristicCandidate(candidate: string) {
  const normalized = normalizeVocabulary(candidate);
  const words = tokenizeVocabularyWords(normalized);
  if (words.length < 2) {
    return false;
  }

  const lowerWords = words.map((word) => word.toLowerCase());
  const reportingVerbs = new Set([
    "say",
    "says",
    "said",
    "report",
    "reported",
    "reports",
    "call",
    "called",
    "calls",
  ]);
  const weakTailWords = new Set([
    "armed",
    "gathering",
    "holding",
    "hosting",
    "attending",
    "allowing",
    "voiced",
  ]);

  if (reportingVerbs.has(lowerWords[0] ?? "")) {
    return true;
  }

  if (reportingVerbs.has(lowerWords.at(-1) ?? "")) {
    return true;
  }

  if (
    words.length === 2 &&
    /^[A-Z][A-Za-z-]+$/.test(words[0] ?? "") &&
    reportingVerbs.has(lowerWords[1] ?? "")
  ) {
    return true;
  }

  if (
    words.length >= 2 &&
    /^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,3}$/.test(words.slice(0, -1).join(" ")) &&
    reportingVerbs.has(lowerWords.at(-1) ?? "")
  ) {
    return true;
  }

  if (
    words.length === 2 &&
    reportingVerbs.has(lowerWords[0] ?? "") &&
    weakTailWords.has(lowerWords[1] ?? "")
  ) {
    return true;
  }

  return false;
}

function isNarrativeClauseFragment(candidate: string) {
  const normalized = normalizeVocabulary(candidate);
  const words = tokenizeVocabularyWords(normalized);
  if (words.length < 2 || words.length > 6) {
    return false;
  }

  const lowerWords = words.map((word) => word.toLowerCase());
  const weakPredicateWords = new Set([
    "say",
    "says",
    "said",
    "tell",
    "tells",
    "told",
    "report",
    "reports",
    "reported",
    "announce",
    "announced",
    "admit",
    "admitted",
    "appoint",
    "appointed",
    "deliver",
    "delivered",
    "fall",
    "fell",
    "injure",
    "injured",
    "leave",
    "left",
    "have",
    "has",
    "had",
    "is",
    "are",
    "was",
    "were",
  ]);

  const startsLikeSubject =
    /^[A-Z][A-Za-z-]+$/.test(words[0] ?? "") ||
    /^(?:local|state|federal|senior|western|eastern|northern|southern)$/i.test(words[0] ?? "") ||
    /^(?:officials|people|media|authorities|police|lawmakers|leaders|residents|witnesses|drones|troops|fighters|vehicles)$/i.test(
      words[0] ?? "",
    );

  if (startsLikeSubject && weakPredicateWords.has(lowerWords[1] ?? "")) {
    return true;
  }

  if (
    words.length >= 3 &&
    /^(?:local|state|federal|senior)$/i.test(words[0] ?? "") &&
    weakPredicateWords.has(lowerWords.at(-1) ?? "")
  ) {
    return true;
  }

  if (
    /^(?:officials|people|media|authorities|police|lawmakers|leaders|residents|witnesses|drones|troops|fighters|vehicles)$/i.test(
      words[0] ?? "",
    ) &&
    (weakPredicateWords.has(lowerWords[1] ?? "") || weakPredicateWords.has(lowerWords.at(-1) ?? ""))
  ) {
    return true;
  }

  return false;
}

const LOW_VALUE_STANDALONE_WORDS = new Set([
  "after",
  "arriving",
  "before",
  "business",
  "leaders",
  "largest",
  "meeting",
  "nations",
  "returns",
  "without",
  "workers",
]);

function isHighValueStandaloneLearningWord(word: string) {
  const normalized = normalizeVocabulary(word).toLowerCase();
  if (!normalized || LOW_VALUE_STANDALONE_WORDS.has(normalized)) {
    return false;
  }

  return isAdvancedStandaloneWord(word);
}

function pruneRedundantSentenceEntries(entries: StructuredEntry[]) {
  const grouped = new Map<string, StructuredEntry[]>();
  for (const entry of entries) {
    const key = normalizeSentence(entry.sentence);
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }

  const pruned: StructuredEntry[] = [];

  for (const [sentence, sentenceEntries] of grouped) {
    const sortedEntries = [...sentenceEntries].sort((left, right) => {
      const scoreDiff =
        scoreHeuristicCandidate(right.vocabulary, sentence) -
        scoreHeuristicCandidate(left.vocabulary, sentence);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const wordCountDiff = countWords(right.vocabulary) - countWords(left.vocabulary);
      if (wordCountDiff !== 0) {
        return wordCountDiff;
      }

      return right.vocabulary.length - left.vocabulary.length;
    });

    const kept: StructuredEntry[] = [];

    for (const candidate of sortedEntries) {
      const normalizedCandidate = normalizeVocabulary(candidate.vocabulary).toLowerCase();
      const candidateWordCount = countWords(candidate.vocabulary);

        const isRedundant = kept.some((existing) => {
          const normalizedExisting = normalizeVocabulary(existing.vocabulary).toLowerCase();
          if (!normalizedCandidate || !normalizedExisting) {
            return false;
          }

          if (normalizedExisting === normalizedCandidate) {
            return true;
          }

          if (shouldCollapseToLongestProperNounVariant(candidate.vocabulary, existing.vocabulary)) {
            return true;
          }

          const overlapRatio = wordOverlapRatio(existing.vocabulary, candidate.vocabulary);
          const containsRelationship =
            normalizedExisting.includes(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedExisting);

        if (!containsRelationship || overlapRatio < 0.8) {
          return false;
        }

        const existingWordCount = countWords(existing.vocabulary);
        const shorter =
          existingWordCount <= candidateWordCount ? existing.vocabulary : candidate.vocabulary;
        const longer =
          existingWordCount > candidateWordCount ? existing.vocabulary : candidate.vocabulary;

        if (shouldPreferStandaloneWordAlongsidePhrase(shorter, longer)) {
          return false;
        }

        if (Math.abs(existingWordCount - candidateWordCount) >= 2) {
          return true;
        }

        if (Math.min(existingWordCount, candidateWordCount) <= 2) {
          return true;
        }

        return true;
      });

      if (!isRedundant) {
        kept.push(candidate);
      }
    }

    pruned.push(...kept);
  }

  return pruned;
}

function isPlaceholderChinese(value: string) {
  const normalized = value.trim();
  return (
    normalized.length === 0 ||
    normalized.includes("待补充") ||
    normalized.includes("占位") ||
    normalized.toLowerCase() === "todo"
  );
}

function isLowQualityChineseMeaning(vocabulary: string, value: string) {
  const normalized = value.trim();
  const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();

  if (isPlaceholderChinese(normalized)) {
    return true;
  }

  if (/[A-Za-z]{2,}/.test(normalized)) {
    return true;
  }

  if (LOW_QUALITY_CHINESE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (
    countWords(vocabulary) >= 2 &&
    normalized.includes("；") &&
    tokenizeVocabularyWords(normalizedVocabulary).length === normalized.split("；").length
  ) {
    return true;
  }

  return false;
}

function repairChineseMeaning(vocabulary: string, value: string) {
  const normalized = value.trim();
  if (!isLowQualityChineseMeaning(vocabulary, normalized)) {
    return normalized;
  }

  const heuristicChinese = lookupHeuristicChinese(vocabulary).trim();
  if (
    heuristicChinese &&
    !/[A-Za-z]{2,}/.test(heuristicChinese) &&
    !LOW_QUALITY_CHINESE_PATTERNS.some((pattern) => pattern.test(heuristicChinese))
  ) {
    return heuristicChinese;
  }

  return "";
}

function isValidLearningEntry(sentence: string, entry: StructuredEntry) {
  const normalizedSentence = normalizeSentence(sentence);
  const normalizedEntrySentence = normalizeSentence(entry.sentence);
  const comparableSentence = normalizeSentenceForComparison(normalizedSentence);
  const comparableEntrySentence = normalizeSentenceForComparison(normalizedEntrySentence);
  const vocabulary = normalizeVocabulary(entry.vocabulary);
  const lowerSentence = normalizedSentence.toLowerCase();
  const lowerVocabulary = vocabulary.toLowerCase();
  const wordCount = countWords(vocabulary);
  const firstTwoWords = normalizeSentence(sentence)
    .split(" ")
    .slice(0, 2)
    .join(" ")
    .toLowerCase();
  const looksLikeNamedEntity =
    /^(?:President|Prime Minister|Secretary of State|Congressman)\b/.test(vocabulary) ||
    /^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,3}$/.test(vocabulary);

  if (!normalizedEntrySentence || comparableEntrySentence !== comparableSentence) {
    return false;
  }

  if (isLowQualitySourceSentence(normalizedSentence)) {
    return false;
  }

  if (!vocabulary || !lowerSentence.includes(lowerVocabulary)) {
    return false;
  }

  if (wordCount > 8) {
    return false;
  }

  if (wordCount === 1 && !looksLikeNamedEntity && !isHighValueStandaloneLearningWord(vocabulary)) {
    return false;
  }

  if (isLowQualityChineseMeaning(vocabulary, entry.chinese)) {
    return false;
  }

  if (sharedIsLowQualityExample(normalizedSentence, entry.example)) {
    return false;
  }

  if (firstTwoWords && lowerVocabulary === firstTwoWords && wordCount < 3 && !looksLikeNamedEntity) {
    return false;
  }

  if (/^(this is|there is|there are|it says|at least)\b/i.test(vocabulary)) {
    return false;
  }

  if (/^(many|several|those|these|their|which|while|where|when)\b/i.test(vocabulary)) {
    return false;
  }

  if (/^(?:one|two|three|four|five|six|seven|eight|nine|ten|many|several)\b/i.test(vocabulary)) {
    return false;
  }

  if (isAwkwardHeuristicCandidate(vocabulary) || isNarrativeClauseFragment(vocabulary)) {
    return false;
  }

  if (/\b(?:who|that|which)\b/i.test(vocabulary) && wordCount >= 3) {
    return false;
  }

  if (/\b(?:said|say|says|during|after|before)\b/i.test(vocabulary) && wordCount >= 3) {
    return false;
  }

  return true;
}

function sanitizeStructuredEntry(entry: StructuredEntry) {
  const vocabulary = normalizeVocabulary(entry.vocabulary);
  const sentence = collapseRepeatedSentenceFragments(entry.sentence);
  const example = normalizeSentence(entry.example);
  const chinese = repairChineseMeaning(vocabulary, entry.chinese);

  return {
    sentence,
    vocabulary,
    chinese,
    example,
    partOfSpeech: normalizeSentence(entry.partOfSpeech ?? ""),
    sentenceChinese: normalizeSentence(entry.sentenceChinese ?? ""),
    exampleChinese: normalizeSentence(entry.exampleChinese ?? ""),
    difficulty: normalizeSentence(entry.difficulty ?? ""),
    category: entry.category ?? "learning",
    pronunciation:
      entry.pronunciation?.trim() || `${vocabulary}. ${example || sentence}. ${sentence}`,
  };
}

function isLikelyProperNounVocabulary(vocabulary: string) {
  const normalized = normalizeVocabulary(vocabulary);
  if (!normalized) {
    return false;
  }

  if (/^(?:President|Prime Minister|Secretary of State|Congressman|Committee|Agency|University)\b/.test(normalized)) {
    return true;
  }

  if (/^[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,4}$/.test(normalized)) {
    return true;
  }

  const lowerNormalized = normalized.toLowerCase();
  return Boolean(NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[lowerNormalized] && /[A-Z]/.test(normalized[0] ?? ""));
}

function applyLearningEntryDefaults(entry: StructuredEntry) {
  const normalized = sanitizeStructuredEntry(entry);
  return {
    ...normalized,
    partOfSpeech: normalized.partOfSpeech || "phrase",
    difficulty: normalized.difficulty || "B2",
    category: "learning" as const,
  };
}

function applyProperNounEntryDefaults(entry: StructuredEntry) {
  const normalized = sanitizeStructuredEntry(entry);
  return {
    ...normalized,
    partOfSpeech: normalized.partOfSpeech || "proper noun",
    difficulty: normalized.difficulty || "B2",
    category: "proper-noun" as const,
  };
}

function pickVocabulary(sentence: string) {
  const trimmedSentence = sentence.replace(/\s+/g, " ").trim();
  const priorityPatterns = [
    /\bexecutive order\b/i,
    /\bartificial intelligence\b/i,
    /\bnational security\b/i,
    /\bMarco Rubio\b/i,
    /\bCapitol Hill\b/i,
    /\bnuclear talks\b/i,
    /\bceasefire\b/i,
    /\bmilitary escalation\b/i,
    /\bunderground tunnel\b/i,
    /\bdrug cartel\b/i,
    /\bpeace talks\b/i,
  ];

  for (const pattern of priorityPatterns) {
    const match = trimmedSentence.match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }

  const titledNameMatch = trimmedSentence.match(
    /\b(?:President|Prime Minister|Secretary of State)\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2}\b/,
  );
  if (titledNameMatch?.[0]) {
    return titledNameMatch[0];
  }

  const properNounMatch = trimmedSentence.match(/\b[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}\b/);
  if (properNounMatch?.[0]) {
    return properNounMatch[0];
  }

  const phraseMatch = sentence.match(
    /\b([A-Za-z-]{5,}\s+[A-Za-z-]{4,}(?:\s+[A-Za-z-]{4,})?)\b/,
  );
  if (phraseMatch?.[1]) {
    return phraseMatch[1];
  }

  const stopWords = new Set([
    "about",
    "after",
    "before",
    "their",
    "there",
    "which",
    "would",
    "could",
    "should",
    "must",
    "across",
    "created",
    "executives",
  ]);
  const words = (sentence.match(/[A-Za-z-]{5,}/g) ?? []).filter(
    (word) => !stopWords.has(word.toLowerCase()),
  );
  return words.sort((left, right) => right.length - left.length)[0] ?? "key expression";
}

function extractHeuristicVocabularies(sentence: string) {
  const trimmedSentence = sentence.replace(/\s+/g, " ").trim();
  if (isLikelyOcrNoiseSentence(trimmedSentence)) {
    return [];
  }
  const candidates: string[] = [];

  for (const pattern of PRIORITY_HEURISTIC_PATTERNS) {
    const match = trimmedSentence.match(pattern);
    if (match?.[0]) {
      candidates.push(match[0]);
    }
  }

  const titledNameMatch = trimmedSentence.match(
    /\b(?:President|Prime Minister|Secretary of State)\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2}\b/,
  );
  if (titledNameMatch?.[0]) {
    candidates.push(titledNameMatch[0]);
  }

  const properNounMatches =
    trimmedSentence.match(/\b[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,3}\b/g) ?? [];
  candidates.push(...properNounMatches);

  const singleEntityWords = trimmedSentence.match(/\b[A-Z][A-Za-z-]{2,}\b/g) ?? [];
  for (const word of singleEntityWords) {
    const normalizedWord = normalizeVocabulary(word).toLowerCase();
    if (
      NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalizedWord] ||
      HEURISTIC_WORD_TRANSLATIONS[normalizedWord]
    ) {
      candidates.push(word);
    }
  }

  const phraseMatches =
    trimmedSentence.match(/\b[A-Za-z-]{4,}(?:\s+[A-Za-z-]{2,}){1,5}\b/g) ?? [];
  candidates.push(...phraseMatches);
  candidates.push(...extractContextualChunks(trimmedSentence));

  const words = tokenizeVocabularyWords(trimmedSentence);
  for (let size = 2; size <= 6; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      const phraseWords = tokenizeVocabularyWords(phrase);
      const firstPhraseWord = phraseWords[0]?.toLowerCase() ?? "";
      const lastPhraseWord = phraseWords.at(-1)?.toLowerCase() ?? "";
      const capitalizedCount = phraseWords.filter((word) => /^[A-Z]/.test(word)).length;
      const hasStrongWord = phraseWords.some(
        (word) =>
          word.length >= 6 ||
          /^[A-Z]/.test(word) ||
          isAdvancedStandaloneWord(word) ||
          Boolean(HEURISTIC_WORD_TRANSLATIONS[word.toLowerCase()]),
      );
      if (
        phraseWords.length >= 2 &&
        !PHRASE_EDGE_STOPWORDS.has(firstPhraseWord) &&
        !PHRASE_EDGE_STOPWORDS.has(lastPhraseWord) &&
        hasStrongWord &&
        !(
          capitalizedCount >= 1 &&
          capitalizedCount < phraseWords.length &&
          /^[A-Z]/.test(phraseWords[0] ?? "") &&
          phraseWords.length >= 3
        )
      ) {
        candidates.push(phrase);
      }
    }
  }

  const longWords = (trimmedSentence.match(/[A-Za-z-]{6,}/g) ?? []).filter(
    (word) => !GENERIC_HEURISTIC_WORDS.has(word.toLowerCase()) && isAdvancedStandaloneWord(word),
  );
  candidates.push(...longWords);

  const bestCandidates = new Map<string, { candidate: string; score: number }>();
  for (const candidate of candidates) {
    const normalized = normalizeVocabulary(candidate).toLowerCase();
    if (!normalized) {
      continue;
    }

    if (isAwkwardHeuristicCandidate(candidate)) {
      continue;
    }

    const score = scoreHeuristicCandidate(candidate, trimmedSentence);
    if (score < 30) {
      continue;
    }

    const existing = bestCandidates.get(normalized);
    if (!existing || score > existing.score || candidate.length > existing.candidate.length) {
      bestCandidates.set(normalized, { candidate, score });
    }
  }

  return Array.from(bestCandidates.values())
    .sort((left, right) => right.score - left.score || right.candidate.length - left.candidate.length)
    .map((entry) => entry.candidate)
    .slice(0, 18);
}

function normalizeOcrTranscript(transcript: string) {
  const lines = transcript
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const mergedLines: string[] = [];
  let current = "";

  for (const line of lines) {
    const currentEndsSentence = /[.!?]["')\]]?$/.test(current);
    const currentLooksLikeLabel = current.length > 0 && countWords(current) <= 3;
    const lineStartsContinuation =
      /^[a-z0-9(]/.test(line) ||
      /^(?:and|but|or|because|despite|with|for|to|of|on|in|at|by|from|that|which)\b/i.test(line);
    const shouldMerge =
      current.length > 0 &&
      (!currentEndsSentence || lineStartsContinuation || currentLooksLikeLabel);

    if (!current) {
      current = line;
      continue;
    }

    if (shouldMerge) {
      current = `${current} ${line}`.replace(/\s+/g, " ").trim();
      continue;
    }

    mergedLines.push(current);
    current = line;
  }

  if (current) {
    mergedLines.push(current);
  }

  return mergedLines
    .join("\n")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")
    .replace(/\bAl\b/g, "AI")
    .replace(/\by-\s*increasingly\b/gi, "increasingly")
    .replace(/\byincreasingly\b/gi, "increasingly")
    .replace(/\s*\[[^\]\n]{1,12}\]\s*/g, " ")
    .replace(/\s+[^\p{L}\p{N}\s.,;:!?'"()/%$-]{1,3}\s+/gu, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function splitTranscriptSentences(transcript: string) {
  const protectedText = normalizeOcrTranscript(transcript).replace(
    /\b(?:[A-Z]\.){2,}|\b(?:St|Gen|Sen|Rep|Gov|Dr|Mr|Mrs|Ms)\./g,
    (match) => match.replaceAll(".", "<dot>"),
  );

  return protectedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replaceAll("<dot>", ".").trim())
    .filter((sentence) => /[A-Za-z]/.test(sentence))
    .filter((sentence) => !isLikelyOcrNoiseSentence(sentence));
}

function cleanTranscript(content: string) {
  return normalizeOcrTranscript(
    content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, ""))
    .replace(/^TRANSCRIPT\s*:/im, "")
    .trim(),
  );
}

function isLikelyAuraWorkspaceScreenshot(value: string) {
  const normalized = value.toLowerCase();
  const markers = [
    "my.feishu.cn",
    "apnews",
    "screenshot_",
    "https://",
    "feishu",
    "当前任务",
    "任务管理",
    "开始分析",
    "上传图片",
    "上传图片/文件",
    "飞书输出",
    "识别结果",
    "词汇记录",
    "发音片段",
    "同步飞书",
  ];

  const matched = markers.filter((marker) => normalized.includes(marker.toLowerCase())).length;
  return matched >= 3;
}

function createFallbackEntries(transcript: string) {
  const sentences = Array.from(new Set(splitTranscriptSentences(transcript)));
  return sentences.flatMap((sentence, sentenceIndex) => {
    const vocabularies = extractHeuristicVocabularies(sentence);
    const resolvedVocabularies = vocabularies.length > 0 ? vocabularies : [pickVocabulary(sentence)];

    return resolvedVocabularies.map((vocabulary, vocabularyIndex) => ({
      id: `entry-${Date.now()}-fallback-${sentenceIndex}-${vocabularyIndex}`,
      sentence,
      vocabulary,
      chinese: lookupHeuristicChinese(vocabulary),
      example: createHeuristicExample(vocabulary),
      pronunciation: `${vocabulary}. ${sentence}`,
    }));
  });
}

function extractRequestedTermEntries(params: {
  transcript: string;
  requestedTerms: string[];
  existingEntries: RecognitionEntry[];
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const resolvedEntries: StructuredEntry[] = [];

  for (const requestedTerm of params.requestedTerms) {
    const variants = buildSearchVariants(requestedTerm);
    if (variants.length === 0) {
      continue;
    }

    const matchedSentence = sentences.find((sentence) => {
      const normalizedSentence = normalizeSearchTerm(sentence);
      return variants.some((variant) => normalizedSentence.includes(variant));
    });

    if (!matchedSentence) {
      continue;
    }

    const normalizedSentence = normalizeSearchTerm(matchedSentence);
    const matchedVariant =
      variants.find((variant) => normalizedSentence.includes(variant)) ?? variants[0];
    const sentenceWords = matchedSentence.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    const variantTokens = matchedVariant.split(" ").filter(Boolean);

    let matchedVocabulary = sentenceWords.find(
      (word) => normalizeSearchTerm(word) === matchedVariant,
    ) ?? requestedTerm.trim();

    if (variantTokens.length >= 2) {
      for (let index = 0; index <= sentenceWords.length - variantTokens.length; index += 1) {
        const candidateWords = sentenceWords.slice(index, index + variantTokens.length);
        const normalizedCandidate = candidateWords.map((word) => normalizeSearchTerm(word)).join(" ");
        if (normalizedCandidate === matchedVariant) {
          matchedVocabulary = candidateWords.join(" ");
          break;
        }
      }
    }
    const normalizedVocabulary = normalizeVocabulary(matchedVocabulary).toLowerCase();
    if (!normalizedVocabulary) {
      continue;
    }

    resolvedEntries.push({
      sentence: matchedSentence,
      vocabulary: matchedVocabulary,
      chinese: lookupHeuristicChinese(matchedVocabulary),
      example: createHeuristicExample(matchedVocabulary),
      pronunciation: `${matchedVocabulary}. ${matchedSentence}`,
    });
  }

  return filterAppendRequestedEntries(resolvedEntries);
}

function findMissingRequestedTerms(
  requestedTerms: string[],
  entries: StructuredEntry[],
) {
  return requestedTerms.filter((requestedTerm) => {
    const variants = buildSearchVariants(requestedTerm);
    return !entries.some((entry) => {
      const normalizedVocabulary = normalizeVocabulary(entry.vocabulary).toLowerCase();
      return variants.some(
        (variant) =>
          normalizedVocabulary.includes(variant) || variant.includes(normalizedVocabulary),
      );
    });
  });
}

function filterEntriesToRequestedTerms(
  requestedTerms: string[],
  entries: StructuredEntry[],
) {
  if (requestedTerms.length === 0) {
    return entries;
  }

  return entries.filter((entry) => {
    const normalizedVocabulary = normalizeVocabulary(entry.vocabulary).toLowerCase();
    return requestedTerms.some((requestedTerm) =>
      buildSearchVariants(requestedTerm).some(
        (variant) =>
          normalizedVocabulary === variant ||
          normalizedVocabulary.includes(variant) ||
          variant.includes(normalizedVocabulary),
      ),
    );
  });
}

function filterAppendRequestedEntries(entries: StructuredEntry[]) {
  return pruneRedundantSentenceEntries(
    dedupeLearningEntries(
      entries
        .map((entry) => applyLearningEntryDefaults(entry))
        .filter((entry) => {
          const sentence = normalizeSentence(entry.sentence);
          const vocabulary = normalizeVocabulary(entry.vocabulary);
          return (
            sentence.length > 0 &&
            vocabulary.length > 0 &&
            !isLowQualitySourceSentence(sentence) &&
            sentence.toLowerCase().includes(vocabulary.toLowerCase()) &&
            countWords(vocabulary) <= 8
          );
        }),
    ),
  );
}

function dedupeLearningEntries(entries: StructuredEntry[]) {
  return entries.filter((entry, index, current) => {
    const key = `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`;
    return (
      current.findIndex((candidate) => {
        const candidateKey = `${normalizeSentence(candidate.sentence)}__${normalizeVocabulary(
          candidate.vocabulary,
        ).toLowerCase()}`;
        return candidateKey === key;
      }) === index
    );
  });
}

function countCoveredSentences(entries: StructuredEntry[]) {
  return new Set(entries.map((entry) => normalizeSentence(entry.sentence))).size;
}

function chunkArray<T>(items: T[], size: number) {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getDesiredEntryCount(transcript: string) {
  const sentenceCount = splitTranscriptSentences(transcript).length;
  if (sentenceCount <= 1) {
    return 14;
  }

  return Math.min(Math.max(sentenceCount * 7, 24), 72);
}

function filterValidEntries(entries: StructuredEntry[]) {
  return pruneRedundantSentenceEntries(
    dedupeLearningEntries(
      entries
        .map((entry) => applyLearningEntryDefaults(entry))
        .filter((entry) => !isLikelyProperNounVocabulary(entry.vocabulary))
        .filter((entry) => isValidLearningEntry(entry.sentence, entry)),
    ),
  );
}

function filterDisplayEntries(entries: StructuredEntry[]) {
  return pruneRedundantSentenceEntries(
    dedupeLearningEntries(
      entries
        .map((entry) => ({
          sentence: normalizeSentence(entry.sentence),
          vocabulary: normalizeVocabulary(entry.vocabulary),
          chinese: "",
          example: "",
          partOfSpeech: normalizeSentence(entry.partOfSpeech ?? ""),
          sentenceChinese: normalizeSentence(entry.sentenceChinese ?? ""),
          exampleChinese: normalizeSentence(entry.exampleChinese ?? ""),
          difficulty: normalizeSentence(entry.difficulty ?? ""),
          category: "learning" as const,
          pronunciation:
            entry.pronunciation?.trim() ||
            `${normalizeVocabulary(entry.vocabulary)}. ${normalizeSentence(entry.sentence)}`,
        }))
        .filter((entry) => {
          return (
            entry.sentence.length > 0 &&
            entry.vocabulary.length > 0 &&
            !isLikelyProperNounVocabulary(entry.vocabulary) &&
            !isLowQualitySourceSentence(entry.sentence) &&
            entry.sentence.toLowerCase().includes(entry.vocabulary.toLowerCase()) &&
            (countWords(entry.vocabulary) > 1 || isHighValueStandaloneLearningWord(entry.vocabulary)) &&
            !isAwkwardHeuristicCandidate(entry.vocabulary) &&
            !isNarrativeClauseFragment(entry.vocabulary)
          );
        }),
    ),
  );
}

function filterProperNounEntries(entries: StructuredEntry[]) {
  return dedupeLearningEntries(
    entries
      .map((entry) => applyProperNounEntryDefaults(entry))
      .filter((entry) => {
        return (
          entry.sentence.length > 0 &&
          entry.vocabulary.length > 0 &&
          isLikelyProperNounVocabulary(entry.vocabulary) &&
          !isLowQualitySourceSentence(entry.sentence) &&
          entry.sentence.toLowerCase().includes(entry.vocabulary.toLowerCase()) &&
          !isNarrativeClauseFragment(entry.vocabulary)
        );
      }),
  );
}

function keepDirectModelLearningEntries(entries: StructuredEntry[]) {
  return dedupeLearningEntries(
    entries
      .map((entry) => applyLearningEntryDefaults(entry))
      .filter((entry) => {
        const sentence = normalizeSentence(entry.sentence);
        const vocabulary = normalizeVocabulary(entry.vocabulary);
        return (
          sentence.length > 0 &&
          vocabulary.length > 0 &&
          !isLowQualitySourceSentence(sentence) &&
          sentence.toLowerCase().includes(vocabulary.toLowerCase())
        );
      }),
  );
}

function keepDirectModelProperNouns(entries: StructuredEntry[]) {
  return dedupeLearningEntries(
    entries
      .map((entry) => applyProperNounEntryDefaults(entry))
      .filter((entry) => {
        const sentence = normalizeSentence(entry.sentence);
        const vocabulary = normalizeVocabulary(entry.vocabulary);
        return (
          sentence.length > 0 &&
          vocabulary.length > 0 &&
          !isLowQualitySourceSentence(sentence) &&
          sentence.toLowerCase().includes(vocabulary.toLowerCase())
        );
      }),
  );
}

function stripDisplayEntryDetails(entries: StructuredEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    chinese: "",
    example: "",
    category: "learning" as const,
    pronunciation: `${normalizeVocabulary(entry.vocabulary)}. ${normalizeSentence(entry.sentence)}`,
  }));
}

function mergeEntryDetails(baseEntries: StructuredEntry[], resolvedEntries: StructuredEntry[]) {
  const resolvedByKey = new Map(
    resolvedEntries.map((entry) => [
      `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`,
      sanitizeStructuredEntry(entry),
    ]),
  );

  return dedupeLearningEntries(
    baseEntries.map((entry) => {
      const normalizedEntry = sanitizeStructuredEntry(entry);
      const key = `${normalizeSentence(normalizedEntry.sentence)}__${normalizeVocabulary(
        normalizedEntry.vocabulary,
      ).toLowerCase()}`;
      const resolved = resolvedByKey.get(key);
      if (!resolved) {
        return {
          ...normalizedEntry,
          partOfSpeech: normalizedEntry.partOfSpeech,
          sentenceChinese: normalizedEntry.sentenceChinese,
          exampleChinese: normalizedEntry.exampleChinese,
          difficulty: normalizedEntry.difficulty,
          pronunciation:
            normalizedEntry.pronunciation?.trim() ||
            `${normalizedEntry.vocabulary}. ${normalizedEntry.sentence}`,
        };
      }

      return {
        sentence: normalizedEntry.sentence,
        vocabulary: normalizedEntry.vocabulary,
        chinese: resolved.chinese,
        partOfSpeech: resolved.partOfSpeech || normalizedEntry.partOfSpeech,
        sentenceChinese: resolved.sentenceChinese || normalizedEntry.sentenceChinese,
        example: resolved.example,
        exampleChinese: resolved.exampleChinese || normalizedEntry.exampleChinese,
        difficulty: resolved.difficulty || normalizedEntry.difficulty,
        category: normalizedEntry.category ?? resolved.category ?? "learning",
        pronunciation:
          resolved.pronunciation?.trim() ||
          `${normalizedEntry.vocabulary}. ${normalizedEntry.sentence}${resolved.example ? ` ${resolved.example}` : ""}`,
      };
    }),
  );
}

async function enrichDisplayEntriesWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  entries: StructuredEntry[];
}) {
  const displayEntries = filterDisplayEntries(params.entries);
  if (displayEntries.length === 0) {
    return [];
  }

  const generatedEntries = await fillCandidateEntriesWithModel({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    entries: displayEntries,
  }).catch(() => [] as StructuredEntry[]);

  let mergedEntries = mergeEntryDetails(displayEntries, generatedEntries);

  const entriesNeedingRepair = mergedEntries.filter(
    (entry) =>
      isLowQualityChineseMeaning(entry.vocabulary, entry.chinese) ||
      sharedIsLowQualityExample(entry.sentence, entry.example) ||
      !(entry.sentenceChinese ?? "").trim() ||
      !(entry.exampleChinese ?? "").trim() ||
      !(entry.partOfSpeech ?? "").trim(),
  );

  if (entriesNeedingRepair.length > 0) {
    const repairedEntries = await repairEntriesWithModel({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      entries: entriesNeedingRepair,
    }).catch(() => [] as StructuredEntry[]);

    mergedEntries = mergeEntryDetails(mergedEntries, repairedEntries);
  }

  return mergedEntries;
}

function buildHeuristicCandidateEntries(params: {
  transcript: string;
  existingEntries?: RecognitionEntry[];
  currentEntries?: StructuredEntry[];
  limit?: number;
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const existingVocabulary = new Set(
    (params.existingEntries ?? []).map((entry) => normalizeVocabulary(entry.vocabulary).toLowerCase()),
  );
  const existingEntryKeys = new Set(
    (params.currentEntries ?? []).map(
      (entry) =>
        `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`,
    ),
  );
  const candidates: StructuredEntry[] = [];

  for (const sentence of sentences) {
    const vocabularies = extractHeuristicVocabularies(sentence)
      .filter((candidate) => !isLikelyProperNounVocabulary(candidate))
      .slice(0, 12);
    for (const vocabulary of vocabularies) {
      const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
      const key = `${normalizeSentence(sentence)}__${normalizedVocabulary}`;
      if (!normalizedVocabulary || existingVocabulary.has(normalizedVocabulary) || existingEntryKeys.has(key)) {
        continue;
      }

      existingEntryKeys.add(key);
      candidates.push({
        sentence,
        vocabulary,
        chinese: "",
        example: "",
        pronunciation: `${vocabulary}. ${sentence}`,
      });

      if (candidates.length >= (params.limit ?? 24)) {
        return candidates;
      }
    }
  }

  return candidates;
}

function buildRawTranscriptCandidateEntries(params: {
  transcript: string;
  existingEntries?: RecognitionEntry[];
  currentEntries?: StructuredEntry[];
  limit?: number;
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const existingVocabulary = new Set(
    (params.existingEntries ?? []).map((entry) => normalizeVocabulary(entry.vocabulary).toLowerCase()),
  );
  const existingEntryKeys = new Set(
    (params.currentEntries ?? []).map(
      (entry) =>
        `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`,
    ),
  );
  const candidates: StructuredEntry[] = [];
  const resolvedLimit = params.limit ?? 48;

  const pushCandidate = (sentence: string, vocabulary: string) => {
    const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
    const key = `${normalizeSentence(sentence)}__${normalizedVocabulary}`;
    if (!normalizedVocabulary || existingVocabulary.has(normalizedVocabulary) || existingEntryKeys.has(key)) {
      return false;
    }

    existingEntryKeys.add(key);
    candidates.push({
      sentence,
      vocabulary: normalizeVocabulary(vocabulary),
      chinese: "",
      example: "",
      pronunciation: `${normalizeVocabulary(vocabulary)}. ${sentence}`,
    });

    return true;
  };

  // First pass: guarantee at least one candidate per sentence before adding extras.
  for (const sentence of sentences) {
    const vocabularies = extractHeuristicVocabularies(sentence);
    const primaryVocabulary =
      vocabularies.find((candidate) => !isLikelyProperNounVocabulary(candidate)) ||
      vocabularies[0] ||
      pickVocabulary(sentence);
    pushCandidate(sentence, primaryVocabulary);
  }

  for (const sentence of sentences) {
    const vocabularies = extractHeuristicVocabularies(sentence)
      .filter((candidate) => !isLikelyProperNounVocabulary(candidate))
      .slice(0, 10);

    for (const vocabulary of vocabularies) {
      if (candidates.length >= resolvedLimit) {
        break;
      }

      pushCandidate(sentence, vocabulary);
    }
  }

  let entries = filterDisplayEntries(candidates);
  const coveredSentenceKeys = new Set(entries.map((entry) => normalizeSentence(entry.sentence)));

  for (const sentence of sentences) {
    if (coveredSentenceKeys.has(normalizeSentence(sentence))) {
      continue;
    }

    const vocabulary = normalizeVocabulary(pickVocabulary(sentence));
    const key = `${normalizeSentence(sentence)}__${vocabulary.toLowerCase()}`;
    if (!vocabulary || existingVocabulary.has(vocabulary.toLowerCase()) || existingEntryKeys.has(key)) {
      continue;
    }

    existingEntryKeys.add(key);
    entries.push({
      sentence,
      vocabulary,
      chinese: "",
      example: "",
      pronunciation: `${vocabulary}. ${sentence}`,
    });
  }

  return filterDisplayEntries(entries).slice(0, resolvedLimit);
}

async function repairEntriesWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  entries: StructuredEntry[];
}) {
  const repairedEntries: StructuredEntry[] = [];

  for (let index = 0; index < params.entries.length; index += 8) {
    const chunk = params.entries.slice(index, index + 8);
    const payload = await callArkJson({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      timeoutMs: 18000,
      messages: [
        {
          role: "system",
          content: "You are an experienced English teacher repairing vocabulary cards.",
        },
        {
          role: "user",
          content: `
Return valid JSON only:
{
  "entries": [
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
}

Repair the following vocabulary cards.

Rules:
1. sentence must stay exactly the same as provided.
2. vocabulary must stay exactly the same as provided.
3. chinese must be a concise and accurate Chinese meaning.
4. partOfSpeech must be an accurate label such as verb, noun, adjective, adverb, phrase, phrasal verb, noun phrase.
5. sentenceChinese must be a natural Chinese translation of the original sentence.
6. example must be a new natural English example sentence, different from sentence.
7. exampleChinese must be a natural Chinese translation of the example.
8. difficulty must be one CEFR-like label such as B1, B2, C1.
9. pronunciation should be short TTS-friendly readable English text.
10. Do not output placeholders, fragments, OCR garbage, or generic fake examples.
11. Never leave chinese, sentenceChinese, example, or exampleChinese blank for a returned item.
12. If a phrase is understandable in context, you should still provide a direct Chinese meaning and one natural example sentence instead of leaving it blank.
13. Never use meta filler translations such as "原句围绕……展开", "这个例句展示了……的自然用法", or any similar template wording. Both sentenceChinese and exampleChinese must be genuine translations of the actual English sentences.
14. If you truly cannot repair an item reliably, omit that item instead of returning empty fields.
15. Return JSON only.

Items:
${JSON.stringify(chunk, null, 2)}
          `.trim(),
        },
      ],
    }).catch(() => ({ entries: [] as StructuredEntry[] }));

    repairedEntries.push(...((payload.entries ?? []) as StructuredEntry[]));
  }

  return repairedEntries;
}

async function repairChineseMeaningsWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  entries: StructuredEntry[];
}) {
  const repairedEntries: StructuredEntry[] = [];

  for (const chunk of chunkArray(params.entries, 12)) {
    const payload = await callArkJson({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      timeoutMs: 15000,
      messages: [
        {
          role: "system",
          content: "You are an experienced English teacher fixing missing or weak Chinese glossary meanings.",
        },
        {
          role: "user",
          content: `
Return valid JSON only:
{
  "entries": [
    {
      "sentence": "string",
      "vocabulary": "string",
      "chinese": "string"
    }
  ]
}

Fill Chinese meanings for the following vocabulary cards.

Rules:
1. sentence must stay exactly the same as provided.
2. vocabulary must stay exactly the same as provided.
3. chinese must be direct, concise, natural Chinese.
4. Do not leave chinese blank.
5. Do not output placeholders, explanations, pinyin, or fake template text.
6. For proper nouns, use established Chinese names when they are widely used.
7. For phrases, translate the whole useful block instead of splitting word by word.
8. Never use meta filler translations such as "原句围绕……展开" or "这个例句展示了……的自然用法".
9. Return JSON only.

Items:
${JSON.stringify(chunk, null, 2)}
          `.trim(),
        },
      ],
    }).catch(() => ({ entries: [] as StructuredEntry[] }));

    repairedEntries.push(...((payload.entries ?? []) as StructuredEntry[]));
  }

  return repairedEntries;
}

async function fillCandidateEntriesWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  entries: StructuredEntry[];
}) {
  if (params.entries.length === 0) {
    return [];
  }

  const resolvedEntries: StructuredEntry[] = [];

  for (const chunk of chunkArray(params.entries, 12)) {
    const payload = await callArkJson({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      timeoutMs: 10000,
      messages: [
        {
          role: "system",
          content: "You are an experienced English teacher enriching vocabulary cards from OCR-recovered news sentences.",
        },
        {
          role: "user",
          content: `
Return valid JSON only:
{
  "entries": [
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
}

Fill the following candidate vocabulary cards.

Rules:
1. sentence must stay exactly the same as provided.
2. vocabulary must stay exactly the same as provided.
3. chinese must be an accurate, concise Chinese meaning. Do not transliterate blindly unless it is a well-known proper noun.
4. partOfSpeech must be an accurate label such as verb, noun, adjective, adverb, phrase, phrasal verb, noun phrase.
5. sentenceChinese must be a natural Chinese translation of the original sentence.
6. example must be a new natural English sentence, different from the original sentence.
7. exampleChinese must be a natural Chinese translation of the example.
8. difficulty must be one CEFR-like label such as B1, B2, C1.
9. pronunciation should be short TTS-friendly readable English text.
10. These entries are for learning vocabulary, so prefer common high-value words, phrases, collocations, and phrasal verbs over proper nouns.
11. Do not output narrative sentence fragments such as "Hipper told", "drones fell", "Local media reported", "officials said", or "people were injured" as vocabulary items.
12. If a candidate is not reliable enough, omit that item instead of returning blank chinese or blank example fields.
13. Do not shorten a phrase if the sentence clearly contains a fuller useful block such as "life in prison without parole".
14. Return JSON only.

Candidates:
${JSON.stringify(chunk, null, 2)}
        `.trim(),
        },
      ],
    }).catch(() => ({ entries: [] as StructuredEntry[] }));

    resolvedEntries.push(...((payload.entries ?? []) as StructuredEntry[]));
  }

  return filterValidEntries(resolvedEntries);
}

function buildHeuristicFallbackEntries(candidates: StructuredEntry[]) {
  return filterValidEntries(
    candidates.map((candidate) => {
      const vocabulary = normalizeVocabulary(candidate.vocabulary);
      const primaryExample = createHeuristicExample(vocabulary).trim();
      const secondaryExample = createHeuristicSecondaryExample(vocabulary).trim();
      const example = primaryExample || secondaryExample;

      return {
        sentence: candidate.sentence,
        vocabulary,
        chinese: lookupHeuristicChinese(vocabulary),
        example,
        pronunciation: `${vocabulary}. ${candidate.sentence}${example ? ` ${example}` : ""}`,
      };
    }),
  );
}

function buildDeterministicTranscriptFallbackEntries(params: {
  transcript: string;
  existingEntries?: RecognitionEntry[];
  currentEntries?: StructuredEntry[];
  limit?: number;
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const existingVocabulary = new Set(
    (params.existingEntries ?? []).map((entry) => normalizeVocabulary(entry.vocabulary).toLowerCase()),
  );
  const existingKeys = new Set(
    (params.currentEntries ?? []).map(
      (entry) =>
        `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`,
    ),
  );

  const candidates: StructuredEntry[] = [];
  const resolvedLimit = params.limit ?? 24;

  for (const sentence of sentences) {
    const vocabularies = extractHeuristicVocabularies(sentence).slice(0, 4);
    const resolvedVocabularies = vocabularies.length > 0 ? vocabularies : [pickVocabulary(sentence)];

    for (const vocabulary of resolvedVocabularies) {
      const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
      const key = `${normalizeSentence(sentence)}__${normalizedVocabulary}`;
      if (!normalizedVocabulary || existingVocabulary.has(normalizedVocabulary) || existingKeys.has(key)) {
        continue;
      }

      existingKeys.add(key);
      candidates.push({
        sentence,
        vocabulary,
        chinese: "",
        example: "",
        pronunciation: `${vocabulary}. ${sentence}`,
      });

      if (candidates.length >= resolvedLimit) {
        break;
      }
    }
  }

  let entries = buildHeuristicFallbackEntries(candidates);
  const coveredSentenceKeys = new Set(entries.map((entry) => normalizeSentence(entry.sentence)));
  const forcedCandidates: StructuredEntry[] = [];

  for (const sentence of sentences) {
    if (coveredSentenceKeys.has(normalizeSentence(sentence))) {
      continue;
    }

    const vocabulary = pickVocabulary(sentence);
    const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
    const key = `${normalizeSentence(sentence)}__${normalizedVocabulary}`;
    if (!normalizedVocabulary || existingVocabulary.has(normalizedVocabulary) || existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    forcedCandidates.push({
      sentence,
      vocabulary,
      chinese: "",
      example: "",
      pronunciation: `${vocabulary}. ${sentence}`,
    });
  }

  if (forcedCandidates.length > 0) {
    entries = filterValidEntries([
      ...entries,
      ...buildHeuristicFallbackEntries(forcedCandidates),
    ]);
  }

  return entries.slice(0, resolvedLimit);
}

function buildProperNounFallbackEntries(params: {
  transcript: string;
  existingEntries?: RecognitionEntry[];
  currentEntries?: StructuredEntry[];
  limit?: number;
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const existingVocabulary = new Set(
    (params.existingEntries ?? []).map((entry) => normalizeVocabulary(entry.vocabulary).toLowerCase()),
  );
  const existingEntryKeys = new Set(
    (params.currentEntries ?? []).map(
      (entry) =>
        `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`,
    ),
  );
  const candidates: StructuredEntry[] = [];
  const resolvedLimit = params.limit ?? 24;

  for (const sentence of sentences) {
    const vocabularies = extractHeuristicVocabularies(sentence)
      .filter((candidate) => isLikelyProperNounVocabulary(candidate))
      .slice(0, 4);

    for (const vocabulary of vocabularies) {
      const normalizedVocabulary = normalizeVocabulary(vocabulary).toLowerCase();
      const key = `${normalizeSentence(sentence)}__${normalizedVocabulary}`;
      if (!normalizedVocabulary || existingVocabulary.has(normalizedVocabulary) || existingEntryKeys.has(key)) {
        continue;
      }

      existingEntryKeys.add(key);
      candidates.push({
        sentence,
        vocabulary: normalizeVocabulary(vocabulary),
        chinese: lookupHeuristicChinese(vocabulary),
        example: createHeuristicExample(vocabulary),
        partOfSpeech: "proper noun",
        sentenceChinese: "",
        exampleChinese: "",
        difficulty: "B2",
        category: "proper-noun",
        pronunciation: `${normalizeVocabulary(vocabulary)}. ${sentence}`,
      });

      if (candidates.length >= resolvedLimit) {
        return filterProperNounEntries(candidates);
      }
    }
  }

  return filterProperNounEntries(candidates);
}

function buildSentenceCoverageFallbackEntries(params: {
  transcript: string;
  currentEntries?: StructuredEntry[];
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const coveredSentenceKeys = new Set(
    (params.currentEntries ?? []).map((entry) => normalizeSentence(entry.sentence)),
  );
  const fallbackEntries: StructuredEntry[] = [];

  for (const sentence of sentences) {
    if (coveredSentenceKeys.has(normalizeSentence(sentence))) {
      continue;
    }

    const vocabularies = extractHeuristicVocabularies(sentence);
    const preferredVocabulary =
      vocabularies.find((candidate) => !isLikelyProperNounVocabulary(candidate)) ||
      vocabularies.find((candidate) => isLikelyProperNounVocabulary(candidate)) ||
      vocabularies[0] ||
      pickVocabulary(sentence);
    const vocabulary = normalizeVocabulary(preferredVocabulary);

    if (!vocabulary) {
      continue;
    }

    fallbackEntries.push({
      sentence,
      vocabulary,
      chinese: lookupHeuristicChinese(vocabulary),
      example: createHeuristicExample(vocabulary),
      partOfSpeech: isLikelyProperNounVocabulary(vocabulary) ? "proper noun" : "phrase",
      sentenceChinese: "",
      exampleChinese: "",
      difficulty: "B2",
      category: "learning",
      pronunciation: `${vocabulary}. ${sentence}`,
    });
  }

  return dedupeLearningEntries(fallbackEntries);
}

function mergePreferredEntries(primaryEntries: StructuredEntry[], supplementalEntries: StructuredEntry[]) {
  const merged = new Map<string, StructuredEntry>();

  for (const entry of [...supplementalEntries, ...primaryEntries]) {
    const sanitizedEntry = sanitizeStructuredEntry(entry);
    const key = `${normalizeSentence(sanitizedEntry.sentence)}__${normalizeVocabulary(
      sanitizedEntry.vocabulary,
    ).toLowerCase()}`;
    if (!key.trim()) {
      continue;
    }
    merged.set(key, sanitizedEntry);
  }

  return Array.from(merged.values());
}

function fillEntriesWithHeuristicFallback(entries: StructuredEntry[]) {
  const fallbackEntries = buildHeuristicFallbackEntries(entries);
  if (fallbackEntries.length === 0) {
    return entries.map((entry) => applyLearningEntryDefaults(entry));
  }

  return mergeEntryDetails(entries, fallbackEntries).map((entry) =>
    applyLearningEntryDefaults(entry),
  );
}

function ensureDisplayableEntryDetails(entries: StructuredEntry[]) {
  return entries.map((entry) => {
    const vocabulary = normalizeVocabulary(entry.vocabulary);
    const repairedChinese = repairChineseMeaning(vocabulary, entry.chinese);
    const normalizedPartOfSpeech = normalizeSentence(entry.partOfSpeech ?? "").toLowerCase();
    const genericChineseFallback = normalizedPartOfSpeech.includes("proper")
      ? "专有名词"
      : normalizedPartOfSpeech.includes("verb")
        ? "动词表达"
        : normalizedPartOfSpeech.includes("noun")
          ? "名词性表达"
          : normalizedPartOfSpeech.includes("adjective")
            ? "形容词表达"
            : normalizedPartOfSpeech.includes("adverb")
              ? "副词表达"
              : "固定表达";
    const fallbackChinese =
      repairedChinese ||
      lookupHeuristicChinese(vocabulary) ||
      composeHeuristicChinese(vocabulary) ||
      normalizeVocabulary(entry.chinese) ||
      genericChineseFallback;
    const fallbackExample =
      normalizeSentence(entry.example) ||
      createHeuristicExample(vocabulary) ||
      createHeuristicSecondaryExample(vocabulary) ||
      `${vocabulary} is a useful expression in the article.`;
    const fallbackSentenceChinese = normalizeSentence(entry.sentenceChinese ?? "");
    const fallbackExampleChinese = normalizeSentence(entry.exampleChinese ?? "");

    return applyLearningEntryDefaults({
      ...entry,
      vocabulary,
      chinese: fallbackChinese,
      example: fallbackExample,
      sentenceChinese: fallbackSentenceChinese,
      exampleChinese: fallbackExampleChinese,
      pronunciation:
        entry.pronunciation?.trim() || `${vocabulary}. ${normalizeSentence(entry.sentence)}. ${fallbackExample}`,
    });
  });
}

async function supplementEntriesFromTranscript(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcript: string;
  existingEntries?: RecognitionEntry[];
  currentEntries?: StructuredEntry[];
  limit?: number;
}) {
  const candidates = buildHeuristicCandidateEntries({
    transcript: params.transcript,
    existingEntries: params.existingEntries,
    currentEntries: params.currentEntries,
    limit: params.limit ?? 24,
  });

  const deterministicFallbackEntries = buildDeterministicTranscriptFallbackEntries({
    transcript: params.transcript,
    existingEntries: params.existingEntries,
    currentEntries: params.currentEntries,
    limit: params.limit ?? 24,
  });

  if (candidates.length === 0) {
    return deterministicFallbackEntries;
  }

  const modelEntries = await fillCandidateEntriesWithModel({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    entries: candidates,
  });

  const resolvedKeys = new Set(
    modelEntries.map(
      (entry) =>
        `${normalizeSentence(entry.sentence)}__${normalizeVocabulary(entry.vocabulary).toLowerCase()}`,
    ),
  );
  const unresolvedCandidates = candidates.filter((candidate) => {
    const key = `${normalizeSentence(candidate.sentence)}__${normalizeVocabulary(candidate.vocabulary).toLowerCase()}`;
    return !resolvedKeys.has(key);
  });
  const heuristicFallbackEntries = buildHeuristicFallbackEntries(unresolvedCandidates);

  return filterValidEntries(
    mergePreferredEntries(
      [...heuristicFallbackEntries, ...modelEntries],
      deterministicFallbackEntries,
    ),
  );
}

async function ensureHighQualityEntries(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  entries: StructuredEntry[];
  allowRepair?: boolean;
  repairLimit?: number;
}) {
  const sanitizedEntries = dedupeLearningEntries(params.entries.map((entry) => sanitizeStructuredEntry(entry)));
  const validEntries = sanitizedEntries.filter((entry) => isValidLearningEntry(entry.sentence, entry));
  const invalidEntries = sanitizedEntries.filter(
    (entry) =>
      !isValidLearningEntry(entry.sentence, entry) &&
      entry.sentence.trim().length > 0 &&
      entry.vocabulary.trim().length > 0,
  );

  if (invalidEntries.length === 0) {
    return validEntries;
  }

  if (!params.allowRepair) {
    return validEntries;
  }

  const limitedInvalidEntries = invalidEntries.slice(0, params.repairLimit ?? 4);
  if (limitedInvalidEntries.length === 0) {
    return validEntries;
  }

  const repairedEntries = await repairEntriesWithModel({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    entries: limitedInvalidEntries,
  });

  return filterValidEntries([...validEntries, ...repairedEntries]);
}

async function callArkContent(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<Record<string, unknown>>;
  timeoutMs?: number;
}) {
  const response = await fetch(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    signal: AbortSignal.timeout(params.timeoutMs ?? 110000),
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      messages: params.messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Doubao 分析失败：${errorText}`);
  }

  const payload = (await response.json()) as ArkResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Doubao 没有返回有效内容。");
  }

  return content;
}

async function callArkJson(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<Record<string, unknown>>;
  timeoutMs?: number;
}) {
  const content = await callArkContent(params);

  return JSON.parse(extractJsonPayload(content)) as {
    cleanedText?: string;
    entries?: StructuredEntry[];
  };
}

async function extractTextFromImageWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  buffer: Buffer;
  fileType: string;
  coverageMode?: "default" | "exhaustive";
}) {
  const base64 = params.buffer.toString("base64");
  const imageUrl = `data:${params.fileType || "image/png"};base64,${base64}`;
  const content = await callArkContent({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 90000,
    messages: [
      {
        role: "system",
        content: "You are an OCR specialist extracting clean English article text from screenshots.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
Read the screenshot and return valid JSON only:
{
  "cleanedText": "string"
}

Rules:
1. Extract all visible English article sentences in reading order.
2. Keep every sentence complete. Do not skip the lower part of the image.
3. Ignore browser chrome, timestamps, icons, logos, floating buttons, watermarks, and decorative UI.
4. Merge wrapped lines back into full natural sentences.
5. Do not summarize, translate, classify, or extract vocabulary here.
6. Keep names, places, titles, and numbers exactly as shown when readable.
7. If a line is unclear, infer only when the surrounding sentence makes it obvious; otherwise keep the readable text and continue.
8. cleanedText should be the final merged article text in natural reading order.
9. The screenshot may use a dark background with white English text. Read the article text itself, not the app UI.
10. Return JSON only.
11. Pay special attention to the ${params.coverageMode === "exhaustive" ? "full image from top to bottom" : "whole image"} so no sentence is omitted.
            `.trim(),
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  }).catch(() => "");

  if (!content) {
    return { rawContent: "", cleanedText: "" };
  }

  try {
    const payload = JSON.parse(extractJsonPayload(content)) as { cleanedText?: string };
    return {
      rawContent: content,
      cleanedText: cleanTranscript(payload.cleanedText ?? ""),
    };
  } catch {
    const rawText = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/\}\s*$/g, "")
      .trim()
      .replace(/^"+|"+$/g, "");
    return {
      rawContent: content,
      cleanedText: cleanTranscript(rawText),
    };
  }
}

async function extractTextFromImageWithAiFallback(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  buffer: Buffer;
  fileType: string;
}) {
  const primary = await extractTextFromImageWithModel(params).catch(() => ({
    rawContent: "",
    cleanedText: "",
  }));
  const primarySentenceCount = splitTranscriptSentences(primary.cleanedText).length;
  let exhaustive = { rawContent: "", cleanedText: "" };
  let transcript = primary.cleanedText;

  if (!primary.cleanedText) {
    return {
      transcript: "",
      diagnostics: {
        default: buildStageDiagnostics(primary.rawContent, primary.cleanedText),
        exhaustive: null,
        merged: null,
      },
    };
  }

  if (primarySentenceCount <= 8 || primary.cleanedText.length < 1400) {
    exhaustive = await extractTextFromImageWithModel({
      ...params,
      coverageMode: "exhaustive",
    }).catch(() => ({ rawContent: "", cleanedText: "" }));

    if (exhaustive.cleanedText) {
      transcript = mergeTranscriptVariants(primary.cleanedText, exhaustive.cleanedText);
    }
  }

  return {
    transcript,
    diagnostics: {
      default: buildStageDiagnostics(primary.rawContent, primary.cleanedText),
      exhaustive: buildStageDiagnostics(exhaustive.rawContent, exhaustive.cleanedText),
      merged: buildStageDiagnostics(transcript, transcript),
    },
  };
}

async function analyzeImageWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  buffer: Buffer;
  fileType: string;
  instructions?: string;
  existingEntries?: RecognitionEntry[];
}) {
  const base64 = params.buffer.toString("base64");
  const imageUrl = `data:${params.fileType || "image/png"};base64,${base64}`;
  const existingVocabulary = (params.existingEntries ?? [])
    .map((entry) => `${entry.vocabulary} (${entry.sentence})`)
    .join("\n");

  return callArkJson({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 110000,
    messages: [
      {
        role: "system",
        content: "You are an experienced English teacher and structured data generator.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
Read the image and return valid JSON only:
{
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
}

Rules:
1. Return JSON only. Do not wrap in markdown.
2. cleanedText must restore the readable original English text from top to bottom.
3. Each entry.sentence must be a complete original sentence from the image.
4. Each entry.vocabulary must appear verbatim inside its sentence.
5. Fill chinese, partOfSpeech, sentenceChinese, example, exampleChinese, difficulty, and pronunciation for every returned item.
6. Put ordinary learning vocabulary in learningEntries.
7. Put person names, place names, institutions, titles, organizations, and other named entities in properNouns.

User instructions:
${params.instructions || "你是一位经验丰富的高中/大学英语老师。请对我输入的英文原文逐句做课堂式精讲，重点不是简单翻译，而是帮助中国学习者理解长难句、新闻表达和高质量词块。请先在脑中找每句的主干，再拆修饰成分、定语、状语、从句、插入语、介词短语和非谓语结构，然后从每句话中尽可能多提取值得老师上课讲的高质量词条，包括高中英语及以上单词、固定搭配、短语动词、完整名词短语、新闻常用表达，以及人名、地名、机构名、国家名、组织名、头衔、事件名等专有名词。请优先保留完整表达，不要切成碎片，不要重复提取，不要输出半截词块。每个长句都应尽量提取多个高质量词条，而不是只给 1 个。每个词条都要给出准确中文意思、发音、词性或类型、原句翻译、自然英文例句和例句中文翻译。"}

Existing entries to avoid duplicating:
${existingVocabulary || "none"}
            `.trim(),
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  });
}

async function transcribeImageWithTesseract(buffer: Buffer) {
  const tesseractModule = (await import("tesseract.js")) as unknown as {
    createWorker?: (...args: unknown[]) => Promise<{
      recognize: (image: Buffer) => Promise<{ data: { text?: string } }>;
      terminate: () => Promise<unknown>;
    }>;
    default?: {
      createWorker?: (...args: unknown[]) => Promise<{
        recognize: (image: Buffer) => Promise<{ data: { text?: string } }>;
        terminate: () => Promise<unknown>;
      }>;
    };
  };
  const createWorker =
    tesseractModule.createWorker ?? tesseractModule.default?.createWorker;
  if (!createWorker) {
    throw new Error("Tesseract createWorker 不可用。");
  }
  const worker = await createWorker("eng", 1, {
    workerPath: path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
    corePath: path.join(process.cwd(), "node_modules", "tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    workerBlobURL: false,
    logger: () => {},
  });

  try {
    const result = await worker.recognize(buffer);
    const rawText = result.data.text || "";
    return {
      rawText,
      cleanedText: cleanTranscript(rawText),
    };
  } finally {
    await worker.terminate();
  }
}

async function structureTranscript(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcript: string;
  instructions?: string;
  existingEntries?: RecognitionEntry[];
  appendOnly?: boolean;
}) {
  const existingVocabulary = (params.existingEntries ?? [])
    .map((entry) => `${entry.vocabulary} (${entry.sentence})`)
    .join("\n");

  return callArkJson({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 110000,
    messages: [
      {
        role: "system",
        content: "You are an experienced English teacher and structured data generator.",
      },
      {
        role: "user",
        content: `
Analyze the following English material and return valid JSON only:
{
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
}

Rules:
1. Return JSON only. Do not wrap in markdown.
2. cleanedText should be the cleaned original text.
3. sentence must be a complete original sentence from the provided text.
4. vocabulary must appear verbatim inside sentence.
5. Fill chinese, partOfSpeech, sentenceChinese, example, exampleChinese, difficulty, and pronunciation for every returned item.
6. Put ordinary learning vocabulary in learningEntries.
7. Put person names, place names, institutions, titles, organizations, and other named entities in properNouns.
8. If appendOnly is true, only return NEW items that do not duplicate the existing list.

Text:
${params.transcript}

appendOnly:
${params.appendOnly ? "true" : "false"}

User instructions:
${params.instructions || "你是一位经验丰富的高中/大学英语老师。请对英文原文逐句做课堂式精讲，先在脑中看句子主干，再看修饰成分、定语、状语、从句、插入语、介词短语和非谓语结构，然后提取真正值得老师讲解的高质量词条。请从每句话中尽可能多提取高中英语及以上单词、固定搭配、短语动词、完整名词短语、新闻常用表达，以及人名、地名、机构名、国家名、组织名、头衔、事件名等专有名词。优先保留完整表达，不要机械切词，不要重复提取，不要输出半截词块。每个长句要尽量提取多个高质量词条。每个词条都要给出准确中文意思、发音、词性或类型、原句翻译、自然英文例句和例句中文翻译。"}

Existing entries to avoid duplicating:
${existingVocabulary || "none"}
        `.trim(),
      },
    ],
  });
}

function getLearningEntriesFromStructuredPayload(payload: TranscriptStructuredPayload | null | undefined) {
  return payload?.learningEntries ?? payload?.entries ?? [];
}

function getProperNounsFromStructuredPayload(payload: TranscriptStructuredPayload | null | undefined) {
  return payload?.properNouns ?? [];
}

async function extractProperNounEntriesFromTranscript(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcript: string;
  existingEntries?: RecognitionEntry[];
}) {
  const existingVocabulary = (params.existingEntries ?? [])
    .map((entry) => `${entry.vocabulary} (${entry.sentence})`)
    .join("\n");

  const payload = await callArkJson({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 12000,
    messages: [
      {
        role: "system",
        content: "You are an experienced English teacher and structured data generator.",
      },
      {
        role: "user",
        content: `
Analyze the following English material and return valid JSON only:
{
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
}

Rules:
1. Extract only proper nouns and named entities: people, places, institutions, organizations, official titles, products, treaties, geopolitical regions.
2. Do not include ordinary learning vocabulary here.
3. Keep sentence as an original sentence from the transcript.
4. vocabulary must appear verbatim inside sentence.
5. chinese must be a concise and accurate Chinese rendering.
6. partOfSpeech should be "proper noun" unless a more precise title label helps.
7. sentenceChinese must be a natural Chinese translation of the original sentence.
8. example must be one new natural English example sentence related to the entity.
9. exampleChinese must be a natural Chinese translation of the example.
10. difficulty should usually be B1 or B2.
11. Return 5 to 20 proper nouns when the article supports it.
12. Do not duplicate items already listed below.

Text:
${params.transcript}

Existing entries to avoid duplicating:
${existingVocabulary || "none"}
        `.trim(),
      },
    ],
  }).catch(() => ({ properNouns: [] as StructuredEntry[] }));

  return filterProperNounEntries(getProperNounsFromStructuredPayload(payload as TranscriptStructuredPayload));
}

async function enrichProperNounEntriesWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  entries: StructuredEntry[];
}) {
  const properNounEntries = filterProperNounEntries(params.entries);
  if (properNounEntries.length === 0) {
    return [];
  }

  const resolvedEntries: StructuredEntry[] = [];

  for (const chunk of chunkArray(properNounEntries, 6)) {
    const payload = await callArkJson({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      timeoutMs: 14000,
      messages: [
        {
          role: "system",
          content: "You are an experienced English teacher enriching proper noun vocabulary cards from news text.",
        },
        {
          role: "user",
          content: `
Return valid JSON only:
{
  "entries": [
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
}

Fill the following proper noun cards.

Rules:
1. sentence must stay exactly the same as provided.
2. vocabulary must stay exactly the same as provided.
3. chinese must be an accurate Chinese rendering or explanation.
4. partOfSpeech should usually be "proper noun" or a more specific title label.
5. sentenceChinese must be a natural Chinese translation of the original sentence.
6. example must be one new natural English sentence related to the entity.
7. exampleChinese must be a natural Chinese translation of the example.
8. difficulty should usually be B1 or B2.
9. pronunciation should be short TTS-friendly readable English text.
10. Return JSON only.

Entries:
${JSON.stringify(chunk, null, 2)}
          `.trim(),
        },
      ],
    }).catch(() => ({ entries: [] as StructuredEntry[] }));

    resolvedEntries.push(...((payload.entries ?? []) as StructuredEntry[]));
  }

  return mergeEntryDetails(properNounEntries, resolvedEntries).map((entry) => ({
    ...applyProperNounEntryDefaults(entry),
    category: "proper-noun" as const,
  }));
}

async function enrichEntriesForImageTranscript(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcript: string;
  instructions?: string;
  existingEntries?: RecognitionEntry[];
  seedEntries?: StructuredEntry[];
}) {
  const transcript = cleanTranscript(params.transcript);
  const desiredEntryCount = getDesiredEntryCount(transcript);
  const sentenceCount = splitTranscriptSentences(transcript).length;
  const desiredProperNounCount = Math.min(Math.max(Math.ceil(sentenceCount * 1.5), 6), 24);
  let entries = filterDisplayEntries(params.seedEntries ?? []);
  let properNouns: StructuredEntry[] = [];

  if (!transcript) {
    return { entries, properNouns };
  }

  const expectedCoverage = sentenceCount;
  const needsMoreEntries =
    entries.length < Math.max(Math.ceil(desiredEntryCount * 0.6), 8) ||
    countCoveredSentences(entries) < expectedCoverage;

  if (needsMoreEntries) {
    const structured = await structureTranscript({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      transcript,
      instructions: params.instructions,
      existingEntries: params.existingEntries,
      appendOnly: Boolean(params.existingEntries?.length),
    }).catch(() => ({ learningEntries: [] as StructuredEntry[], properNouns: [] as StructuredEntry[] }));

    entries = filterDisplayEntries(
      mergePreferredEntries(
        [...entries, ...getLearningEntriesFromStructuredPayload(structured)],
        entries,
      ),
    );
    properNouns = filterProperNounEntries([
      ...properNouns,
      ...getProperNounsFromStructuredPayload(structured),
    ]);
  }

  const stillNeedsMoreEntries =
    entries.length < Math.max(Math.ceil(desiredEntryCount * 0.75), 10) ||
    countCoveredSentences(entries) < expectedCoverage;

  if (stillNeedsMoreEntries) {
    for (let round = 0; round < 2; round += 1) {
      const supplementalEntries = await supplementEntriesFromTranscript({
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        model: params.model,
        transcript,
        existingEntries: params.existingEntries,
        currentEntries: entries,
        limit: Math.max(desiredEntryCount - entries.length, 12),
      }).catch(() => [] as StructuredEntry[]);

      entries = filterDisplayEntries(
        mergePreferredEntries([...entries, ...supplementalEntries], supplementalEntries),
      );

      const enoughEntries =
        entries.length >= Math.max(Math.ceil(desiredEntryCount * 0.9), 12) &&
        countCoveredSentences(entries) >= expectedCoverage;
      if (enoughEntries || supplementalEntries.length === 0) {
        break;
      }
    }
  }

  const finalNeedsMoreEntries =
    entries.length < Math.max(Math.ceil(desiredEntryCount * 0.9), 12) ||
    countCoveredSentences(entries) < expectedCoverage;

  if (finalNeedsMoreEntries) {
    const deterministicEntries = buildRawTranscriptCandidateEntries({
      transcript,
      existingEntries: params.existingEntries,
      currentEntries: entries,
      limit: Math.max(desiredEntryCount - entries.length, 12),
    });
    entries = filterDisplayEntries(
      mergePreferredEntries([...entries, ...deterministicEntries], deterministicEntries),
    );
  }

  const resolvedEntryLimit = Math.min(Math.max(desiredEntryCount, 24), 72);
  const resolvedEntries = await enrichDisplayEntriesWithModel({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    entries: entries.slice(0, resolvedEntryLimit),
  }).catch(() => [] as StructuredEntry[]);

  const finalizedLearningEntries = fillEntriesWithHeuristicFallback(
    mergePreferredEntries(
      resolvedEntries,
      entries.slice(0, resolvedEntryLimit),
    ),
  );

  let boostedLearningEntries: StructuredEntry[] = finalizedLearningEntries;
  const needsModelBoost =
    boostedLearningEntries.length < Math.max(Math.ceil(desiredEntryCount * 0.6), 10) ||
    countCoveredSentences(boostedLearningEntries) < Math.max(2, Math.floor(expectedCoverage * 0.7));

  if (needsModelBoost) {
    const boostedStructured = await structureTranscript({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      transcript,
      instructions: `${params.instructions ?? ""}\n请不要因为担心错误而过早停止抽取。请继续逐句检查全文，优先补充每个句子里完整、自然、值得老师讲解的单词、固定搭配、短语动词、名词短语和专有名词。严禁输出 officials said、Local media reported、people were injured 这类主语+谓语叙述片段。`,
      existingEntries: params.existingEntries,
      appendOnly: false,
    }).catch(() => ({ learningEntries: [] as StructuredEntry[], properNouns: [] as StructuredEntry[] }));

    boostedLearningEntries = filterValidEntries(
      mergePreferredEntries(
        [
          ...boostedLearningEntries,
          ...getLearningEntriesFromStructuredPayload(boostedStructured),
        ],
        boostedLearningEntries,
      ),
    );

    properNouns = filterProperNounEntries([
      ...properNouns,
      ...getProperNounsFromStructuredPayload(boostedStructured),
    ]);
  }

  if (properNouns.length < desiredProperNounCount) {
    const extractedProperNouns = await extractProperNounEntriesFromTranscript({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      transcript,
      existingEntries: params.existingEntries,
    }).catch(() => [] as StructuredEntry[]);

    properNouns = filterProperNounEntries([...properNouns, ...extractedProperNouns]);
  }

  if (properNouns.length < desiredProperNounCount) {
    properNouns = filterProperNounEntries([
      ...properNouns,
      ...buildProperNounFallbackEntries({
        transcript,
        existingEntries: params.existingEntries,
        currentEntries: properNouns,
        limit: desiredProperNounCount,
      }),
    ]);
  }

  return {
    entries: sortEntriesByTranscriptOrder(transcript, boostedLearningEntries),
    properNouns: properNouns.slice(0, 20),
  };
}

async function generateEntriesForRequestedTermsDirect(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestedTerms: string[];
  instructions?: string;
}) {
  const deterministicEntries: StructuredEntry[] = [];
  const modelRequestedTerms: string[] = [];

  for (const term of params.requestedTerms) {
    const normalized = normalizeVocabulary(term).toLowerCase();
    if (NORMALIZED_HEURISTIC_CHINESE_GLOSSARY[normalized]) {
      deterministicEntries.push({
        sentence: createHeuristicExample(term),
        vocabulary: term.trim(),
        chinese: lookupHeuristicChinese(term),
        example: createHeuristicSecondaryExample(term),
        partOfSpeech: "phrase",
        sentenceChinese: "",
        exampleChinese: "",
        difficulty: "B2",
        category: "learning",
        pronunciation: `${term.trim()}. ${createHeuristicExample(term)}. ${createHeuristicSecondaryExample(term)}`,
      });
      continue;
    }

    modelRequestedTerms.push(term);
  }

  if (modelRequestedTerms.length === 0) {
    return deterministicEntries;
  }

  const payload = await callArkJson({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 12000,
    messages: [
      {
        role: "system",
        content: "You are an experienced English teacher creating high-quality vocabulary cards.",
      },
      {
        role: "user",
        content: `
Return valid JSON only:
{
  "entries": [
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
}

Generate one entry for each requested term or phrase below.

Rules:
1. vocabulary must exactly match or preserve the intended requested term/phrase.
2. sentence must be one complete, natural English sentence using that term.
3. chinese must be a direct, concise Chinese meaning.
4. partOfSpeech must be an accurate label such as verb, noun, adjective, adverb, phrase, phrasal verb, noun phrase.
5. sentenceChinese must be a natural Chinese translation of sentence.
6. example must be a second new natural English example sentence, different from sentence.
7. exampleChinese must be a natural Chinese translation of the example.
8. difficulty must be one CEFR-like label such as B1, B2, C1.
9. pronunciation should be short TTS-friendly text, ideally: "vocabulary. sentence. example."
10. Do not rely on any source article or original text.
11. Do not add extra terms that were not requested.
12. Return JSON only.

Requested terms:
${modelRequestedTerms.join("\n")}

User instructions:
${params.instructions || "请直接为这些词汇生成完整句子、中文意思、例句和发音。"}
        `.trim(),
      },
    ],
  });

  const modelEntries = (payload.entries ?? []).filter((entry) => {
    const vocabulary = normalizeVocabulary(entry.vocabulary);
    return (
      vocabulary.length > 0 &&
      entry.sentence.trim().length > 0 &&
      entry.example.trim().length > 0 &&
      entry.chinese.trim().length > 0
    );
  });

  return dedupeLearningEntries([...deterministicEntries, ...modelEntries]);
}

async function analyzeImageFilesDirectly(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  files: File[];
  instructions?: string;
  existingEntries?: RecognitionEntry[];
  preferOcrFirst?: boolean;
  preferVision?: boolean;
  imageMetadata?: ImageUploadMetadata[];
  fastMode?: boolean;
  directJsonMode?: boolean;
}) {
  if (params.directJsonMode) {
    const results = await Promise.all(
      params.files.map(async (file, index) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const payload = await analyzeImageWithModel({
          apiKey: params.apiKey,
          baseUrl: params.baseUrl,
          model: params.model,
          buffer,
          fileType: file.type,
          instructions: params.instructions,
          existingEntries: [],
        });

        const transcript = cleanTranscript(payload.cleanedText ?? "");
        const entries = dedupeLearningEntries(
          getLearningEntriesFromStructuredPayload(payload as TranscriptStructuredPayload).map((entry) =>
            applyLearningEntryDefaults(entry),
          ),
        );
        const properNouns = dedupeLearningEntries(
          getProperNounsFromStructuredPayload(payload as TranscriptStructuredPayload).map((entry) =>
            applyProperNounEntryDefaults(entry),
          ),
        );

        return {
          transcript,
          entries,
          properNouns,
          method: "vision" as const,
          diagnostics: {
            fileName: file.name,
            image: params.imageMetadata?.[index] ?? null,
            ocr: null,
            visionDefault: buildStageDiagnostics(payload.cleanedText ?? "", transcript),
            visionExhaustive: null,
            mergedTranscript: buildStageDiagnostics(transcript, transcript),
            extractionMethod: "vision" as const,
          },
        };
      }),
    );

    const mergedTranscript = cleanTranscript(
      results
        .map((item) => item.transcript)
        .filter(Boolean)
        .join("\n\n"),
    );
    const entries = sortEntriesByTranscriptOrder(
      mergedTranscript,
      dedupeLearningEntries(results.flatMap((item) => item.entries)),
    );
    const properNouns = dedupeLearningEntries(results.flatMap((item) => item.properNouns));
    const allDisplayEntries = [...entries, ...properNouns];

    return {
      rawText: mergedTranscript,
      cleanedText: mergedTranscript,
      entries,
      properNouns,
      method: "vision" as const,
      diagnostics: {
        imageCount: params.files.length,
        images: params.imageMetadata ?? [],
        files: results.map((item) => item.diagnostics),
        ocrTextLength: mergedTranscript.length,
        ocrTextLines: countTranscriptLines(mergedTranscript),
        ocrSentenceCount: splitTranscriptSentences(mergedTranscript).length,
        aiInputLength: mergedTranscript.length,
        aiInputSentenceCount: splitTranscriptSentences(mergedTranscript).length,
        aiSeedEntryCount: 0,
        aiOutputCount: allDisplayEntries.length,
        finalDisplayCount: allDisplayEntries.length,
        ...summarizeSentenceCoverage(mergedTranscript, allDisplayEntries),
        method: "vision" as const,
      },
    };
  }

  const shouldPreferVision = true;

  const fallbackToOcrTranscript = async () => {
    const transcripts = await Promise.all(
      params.files.map(async (file, index) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ocr = await transcribeImageWithTesseract(buffer).catch(() => ({
          rawText: "",
          cleanedText: "",
        }));

        return {
          transcript: cleanTranscript(ocr.cleanedText),
          diagnostics: {
            fileName: file.name,
            image: params.imageMetadata?.[index] ?? null,
            ocr: buildStageDiagnostics(ocr.rawText, ocr.cleanedText),
            visionDefault: null,
            visionExhaustive: null,
            mergedTranscript: buildStageDiagnostics(ocr.cleanedText, ocr.cleanedText),
            extractionMethod: "tesseract" as const,
          },
        };
      }),
    );

    const mergedTranscript = transcripts
      .map((item) => item.transcript)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!mergedTranscript) {
      return {
        rawText: "",
        cleanedText: "",
        entries: [] as StructuredEntry[],
        properNouns: [] as StructuredEntry[],
        method: "tesseract" as const,
        diagnostics: {
          imageCount: params.files.length,
          images: params.imageMetadata ?? [],
          files: transcripts.map((item) => item.diagnostics),
          ocrTextLength: 0,
          ocrTextLines: 0,
          ocrSentenceCount: 0,
          aiInputLength: 0,
          aiInputSentenceCount: 0,
          aiSeedEntryCount: 0,
          aiOutputCount: 0,
          finalDisplayCount: 0,
          coveredSentenceCount: 0,
          uncoveredSentenceCount: 0,
          coveredSentences: [],
          uncoveredSentences: [],
          method: "tesseract" as const,
        },
      };
    }

    const enriched = await enrichEntriesForImageTranscript({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      transcript: mergedTranscript,
      instructions: params.instructions,
      existingEntries: params.existingEntries,
    }).catch(() => ({
      entries: buildDeterministicTranscriptFallbackEntries({
        transcript: mergedTranscript,
        existingEntries: params.existingEntries,
        limit: Math.min(getDesiredEntryCount(mergedTranscript), 48),
      }),
      properNouns: [] as StructuredEntry[],
    }));

    return {
      rawText: mergedTranscript,
      cleanedText: mergedTranscript,
      entries: enriched.entries,
      properNouns: enriched.properNouns,
      method: "tesseract" as const,
      diagnostics: {
        imageCount: params.files.length,
        images: params.imageMetadata ?? [],
        files: transcripts.map((item) => item.diagnostics),
        ocrTextLength: mergedTranscript.length,
        ocrTextLines: countTranscriptLines(mergedTranscript),
        ocrSentenceCount: splitTranscriptSentences(mergedTranscript).length,
        aiInputLength: mergedTranscript.length,
        aiInputSentenceCount: splitTranscriptSentences(mergedTranscript).length,
        aiSeedEntryCount: 0,
        aiOutputCount: enriched.entries.length,
        finalDisplayCount: enriched.entries.length,
        ...summarizeSentenceCoverage(mergedTranscript, enriched.entries),
        method: "tesseract" as const,
      },
    };
  };

  if (shouldPreferVision) {
    const results = await Promise.all(
      params.files.map(async (file, index) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const [vision, directVisionPayload] = await Promise.all([
          extractTextFromImageWithAiFallback({
            apiKey: params.apiKey,
            baseUrl: params.baseUrl,
            model: params.model,
            buffer,
            fileType: file.type,
          }).catch(() => ({
            transcript: "",
            diagnostics: { default: null, exhaustive: null, merged: null },
          })),
          analyzeImageWithModel({
            apiKey: params.apiKey,
            baseUrl: params.baseUrl,
            model: params.model,
            buffer,
            fileType: file.type,
            instructions: params.instructions,
            existingEntries: params.existingEntries,
          }).catch(() => null),
        ]);

        const directTranscript = directVisionPayload?.cleanedText
          ? cleanTranscript(directVisionPayload.cleanedText)
          : "";
        const mergedTranscript = mergeTranscriptVariants(vision.transcript, directTranscript);
        const directEntries = filterValidEntries(
          getLearningEntriesFromStructuredPayload(directVisionPayload as TranscriptStructuredPayload),
        );
        const directProperNouns = filterProperNounEntries(
          getProperNounsFromStructuredPayload(directVisionPayload as TranscriptStructuredPayload),
        );

        if (mergedTranscript) {
          const fallbackEntries = filterValidEntries(createFallbackEntries(mergedTranscript));
          return {
            transcript: mergedTranscript,
            entries:
              params.fastMode
                ? filterValidEntries(directEntries)
                : directEntries.length > 0
                  ? filterValidEntries([...directEntries, ...fallbackEntries])
                  : fallbackEntries,
            properNouns: directProperNouns,
            method: "vision" as const,
            diagnostics: {
              fileName: file.name,
              image: params.imageMetadata?.[index] ?? null,
              ocr: null,
              visionDefault: vision.diagnostics.default,
              visionExhaustive: vision.diagnostics.exhaustive,
              mergedTranscript: buildStageDiagnostics(mergedTranscript, mergedTranscript),
              extractionMethod: "vision" as const,
            },
          };
        }

        return {
          transcript: "",
          entries: [],
          properNouns: [] as StructuredEntry[],
          method: "vision" as const,
          diagnostics: {
            fileName: file.name,
            image: params.imageMetadata?.[index] ?? null,
            ocr: null,
            visionDefault: vision.diagnostics.default,
            visionExhaustive: vision.diagnostics.exhaustive,
            mergedTranscript: null,
            extractionMethod: "vision" as const,
          },
        };
      }),
    );

    const validResults = results.filter(
      (item) => item.transcript || item.entries.length > 0 || item.properNouns.length > 0,
    );

    const mergedTranscriptFromEntries = validResults
      .flatMap((item) => [
        ...item.entries.map((entry) => entry.sentence),
        ...item.properNouns.map((entry) => entry.sentence),
      ])
      .filter(Boolean)
      .join("\n\n");

    const mergedTranscript = cleanTranscript(
      validResults
        .map((item) => item.transcript)
        .filter(Boolean)
        .join("\n\n") || mergedTranscriptFromEntries,
    );
    const seedEntries = mergedTranscript
      ? params.fastMode
        ? dedupeLearningEntries(filterDisplayEntries(validResults.flatMap((item) => item.entries)))
        : filterDisplayEntries([
            ...validResults.flatMap((item) => item.entries),
            ...buildRawTranscriptCandidateEntries({
              transcript: mergedTranscript,
              existingEntries: params.existingEntries,
              limit: Math.min(getDesiredEntryCount(mergedTranscript), 32),
            }),
          ])
      : [];
    const enriched = mergedTranscript
      ? params.fastMode
        ? {
            entries: sortEntriesByTranscriptOrder(
              mergedTranscript,
              dedupeLearningEntries(seedEntries),
            ),
            properNouns: filterProperNounEntries(validResults.flatMap((item) => item.properNouns)),
          }
        : await enrichEntriesForImageTranscript({
            apiKey: params.apiKey,
            baseUrl: params.baseUrl,
            model: params.model,
            transcript: mergedTranscript,
            instructions: params.instructions,
            existingEntries: params.existingEntries,
            seedEntries,
          })
      : {
          entries: filterDisplayEntries(validResults.flatMap((item) => item.entries)),
          properNouns: filterProperNounEntries(validResults.flatMap((item) => item.properNouns)),
        };
    const entries = enriched.entries;
    const properNouns = enriched.properNouns;

    if (!mergedTranscript && entries.length === 0 && properNouns.length === 0) {
      return fallbackToOcrTranscript();
    }

    const diagnostics: AnalysisDiagnostics = {
      imageCount: params.files.length,
      images: params.imageMetadata ?? [],
      files: results.map((item) => item.diagnostics),
      ocrTextLength: mergedTranscript.length,
      ocrTextLines: countTranscriptLines(mergedTranscript),
      ocrSentenceCount: splitTranscriptSentences(mergedTranscript).length,
      aiInputLength: mergedTranscript.length,
      aiInputSentenceCount: splitTranscriptSentences(mergedTranscript).length,
      aiSeedEntryCount: seedEntries.length,
      aiOutputCount: entries.length,
      finalDisplayCount: entries.length,
      ...summarizeSentenceCoverage(mergedTranscript, entries),
      method: "vision",
    };

    return {
      rawText: mergedTranscript,
      cleanedText: mergedTranscript,
      entries,
      properNouns,
      method: "vision" as const,
      diagnostics,
    };
  }

  if (params.preferOcrFirst) {
    const transcripts = await Promise.all(
      params.files.map(async (file, index) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ocr = await transcribeImageWithTesseract(buffer).catch(() => ({
          rawText: "",
          cleanedText: "",
        }));
        const ocrDiagnostics = buildStageDiagnostics(ocr.rawText, ocr.cleanedText);
        const ocrSentenceCount = splitTranscriptSentences(ocr.cleanedText).length;
        const needsVisionAssist =
          !ocr.cleanedText ||
          ocr.cleanedText.length < 360 ||
          ocrSentenceCount <= 2 ||
          (ocrDiagnostics?.lineCount ?? 0) < 6;
        const vision = needsVisionAssist
          ? await extractTextFromImageWithAiFallback({
              apiKey: params.apiKey,
              baseUrl: params.baseUrl,
              model: params.model,
              buffer,
              fileType: file.type,
            }).catch(() => ({
              transcript: "",
              diagnostics: { default: null, exhaustive: null, merged: null },
            }))
          : {
              transcript: "",
              diagnostics: { default: null, exhaustive: null, merged: null },
            };
        const mergedTranscript = cleanTranscript(
          [ocr.cleanedText, vision.transcript].filter(Boolean).join("\n\n"),
        );
        const method: OcrMethod =
          mergedTranscript && ocr.cleanedText && vision.transcript
            ? "hybrid"
            : vision.transcript
              ? "vision"
              : "tesseract";

        return {
          transcript: mergedTranscript,
          diagnostics: {
            fileName: file.name,
            image: params.imageMetadata?.[index] ?? null,
            ocr: ocrDiagnostics,
            visionDefault: vision.diagnostics.default,
            visionExhaustive: vision.diagnostics.exhaustive,
            mergedTranscript: buildStageDiagnostics(mergedTranscript, mergedTranscript),
            extractionMethod: method,
          },
          method,
        };
      }),
    );

    const mergedTranscript = transcripts
      .map((item) => cleanTranscript(item.transcript))
      .filter(Boolean)
      .join("\n\n")
      .trim();

    let entries: StructuredEntry[] = [];
    let properNouns: StructuredEntry[] = [];
    let seedEntryCount = 0;
    if (mergedTranscript) {
      const seedEntries = buildRawTranscriptCandidateEntries({
        transcript: mergedTranscript,
        existingEntries: params.existingEntries,
        limit: Math.min(getDesiredEntryCount(mergedTranscript), 32),
      });
      seedEntryCount = seedEntries.length;
      const enrichedSeedEntries = await enrichDisplayEntriesWithModel({
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        model: params.model,
        entries: seedEntries,
      }).catch(() => [] as StructuredEntry[]);

      entries = enrichedSeedEntries.length > 0 ? enrichedSeedEntries : seedEntries;
      properNouns = await extractProperNounEntriesFromTranscript({
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        model: params.model,
        transcript: mergedTranscript,
        existingEntries: params.existingEntries,
      }).catch(() => [] as StructuredEntry[]);
    }

    const method = transcripts.some((item) => item.method === "hybrid")
      ? ("hybrid" as const)
      : transcripts.some((item) => item.method === "vision")
        ? ("vision" as const)
        : ("tesseract" as const);
    const diagnostics: AnalysisDiagnostics = {
      imageCount: params.files.length,
      images: params.imageMetadata ?? [],
      files: transcripts.map((item) => item.diagnostics),
      ocrTextLength: mergedTranscript.length,
      ocrTextLines: countTranscriptLines(mergedTranscript),
      ocrSentenceCount: splitTranscriptSentences(mergedTranscript).length,
      aiInputLength: mergedTranscript.length,
      aiInputSentenceCount: splitTranscriptSentences(mergedTranscript).length,
      aiSeedEntryCount: seedEntryCount,
      aiOutputCount: entries.length,
      finalDisplayCount: entries.length,
      ...summarizeSentenceCoverage(mergedTranscript, entries),
      method,
    };

    return {
      rawText: mergedTranscript,
      cleanedText: mergedTranscript,
      entries,
      properNouns,
      method,
      diagnostics,
    };
  }

  const results = await Promise.all(
    params.files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      let transcript = "";

      try {
        const payload = await analyzeImageWithModel({
          apiKey: params.apiKey,
          baseUrl: params.baseUrl,
          model: params.model,
          buffer,
          fileType: file.type,
          instructions: params.instructions,
          existingEntries: params.existingEntries,
        });

        return {
          cleanedText: payload.cleanedText ?? "",
          entries: getLearningEntriesFromStructuredPayload(payload as TranscriptStructuredPayload),
          properNouns: filterProperNounEntries(
            getProperNounsFromStructuredPayload(payload as TranscriptStructuredPayload),
          ),
          method: "vision" as const,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        const isTimeout =
          message.includes("aborted due to timeout") || message.includes("The operation was aborted");

        if (!isTimeout) {
          throw error;
        }

        if (!transcript) {
          const ocr = await transcribeImageWithTesseract(buffer);
          transcript = ocr.cleanedText;
        }

        let structuredEntries: StructuredEntry[] = [];
        let structuredProperNouns: StructuredEntry[] = [];
        if (transcript && transcript !== "EMPTY") {
          const structured = await structureTranscript({
            apiKey: params.apiKey,
            baseUrl: params.baseUrl,
            model: params.model,
            transcript,
            instructions: params.instructions,
            existingEntries: params.existingEntries,
            appendOnly: Boolean(params.existingEntries?.length),
          }).catch(() => ({ learningEntries: [] as StructuredEntry[], properNouns: [] as StructuredEntry[] }));

          structuredEntries = filterValidEntries(getLearningEntriesFromStructuredPayload(structured));
          structuredProperNouns = filterProperNounEntries(getProperNounsFromStructuredPayload(structured));

          const desiredEntryCount = getDesiredEntryCount(transcript);
          const desiredProperNounCount = Math.min(
            Math.max(Math.ceil(splitTranscriptSentences(transcript).length * 1.5), 6),
            24,
          );
          const coveredSentences = countCoveredSentences(structuredEntries);
          const sentenceCount = splitTranscriptSentences(transcript).length;
          if (
            structuredEntries.length < desiredEntryCount ||
            coveredSentences < sentenceCount
          ) {
            const supplementalEntries = await supplementEntriesFromTranscript({
              apiKey: params.apiKey,
              baseUrl: params.baseUrl,
              model: params.model,
              transcript,
              existingEntries: params.existingEntries,
              currentEntries: structuredEntries,
              limit: Math.max(desiredEntryCount - structuredEntries.length, 10),
            });
            structuredEntries = filterValidEntries([...structuredEntries, ...supplementalEntries]);
          }

          if (structuredProperNouns.length < desiredProperNounCount) {
            structuredProperNouns = filterProperNounEntries([
              ...structuredProperNouns,
              ...buildProperNounFallbackEntries({
                transcript,
                existingEntries: params.existingEntries,
                currentEntries: structuredProperNouns,
                limit: desiredProperNounCount,
              }),
            ]);
          }
        }

        return {
          cleanedText: transcript,
          entries:
            transcript && transcript !== "EMPTY"
              ? structuredEntries.length > 0
                ? structuredEntries
                : []
              : [],
          properNouns: structuredProperNouns,
          method: "tesseract" as const,
        };
      }
    }),
  );

  const method = results.some((result) => result.method === "tesseract")
    ? ("tesseract" as const)
    : ("vision" as const);
  const cleanedTexts = results.map((result) => result.cleanedText).filter(Boolean);
  const entries = results.flatMap((result) => result.entries);
  const properNouns = results.flatMap((result) => result.properNouns ?? []);

  return {
    rawText: cleanedTexts.join("\n\n").trim(),
    cleanedText: cleanedTexts.join("\n\n").trim(),
    entries: filterValidEntries(entries),
    properNouns: filterProperNounEntries(properNouns),
    method,
    diagnostics: {
      imageCount: params.files.length,
      images: params.imageMetadata ?? [],
      files: [],
      ocrTextLength: cleanedTexts.join("\n\n").trim().length,
      ocrTextLines: countTranscriptLines(cleanedTexts.join("\n\n").trim()),
      ocrSentenceCount: splitTranscriptSentences(cleanedTexts.join("\n\n").trim()).length,
      aiInputLength: cleanedTexts.join("\n\n").trim().length,
      aiInputSentenceCount: splitTranscriptSentences(cleanedTexts.join("\n\n").trim()).length,
      aiSeedEntryCount: 0,
      aiOutputCount: filterValidEntries(entries).length,
      finalDisplayCount: filterValidEntries(entries).length,
      ...summarizeSentenceCoverage(cleanedTexts.join("\n\n").trim(), filterValidEntries(entries)),
      method,
    },
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((item): item is File => item instanceof File && item.size > 0);
  const singleFile = formData.get("file");
  if (singleFile instanceof File && singleFile.size > 0) {
    files.push(singleFile);
  }

  const instructions = String(formData.get("instructions") || "");
  const existingRawText = String(formData.get("existingRawText") || "");
  const feishuLink = String(formData.get("feishuLink") || "").trim() || DEFAULT_FEISHU_LINK;
  const requestedBaseUrl = String(formData.get("arkBaseUrl") || "");
  const requestedModel = String(formData.get("arkModel") || "");
  const localHeuristic = String(formData.get("localHeuristic") || "") === "1";
  const ocrFirst = String(formData.get("ocrFirst") || "") === "1";
  const preferVision = String(formData.get("preferVision") || "") === "1";
  const fastMode = String(formData.get("fastMode") || "") === "1";
  const directJsonMode = String(formData.get("directJsonMode") || "") === "1";
  const directTermMode = String(formData.get("directTermMode") || "") === "1";
  const stage2Enrich = String(formData.get("stage2Enrich") || "") === "1";
  const sourceFileName = String(formData.get("sourceFileName") || "").trim();
  const requestedTermsRaw = String(formData.get("requestedTerms") || "[]");
  const existingEntriesRaw = String(formData.get("existingEntries") || "[]");
  const imageMetadataRaw = String(formData.get("imageMetadata") || "[]");
  let existingEntries: RecognitionEntry[] = [];
  let requestedTerms: string[] = [];
  let imageMetadata: ImageUploadMetadata[] = [];
  try {
    existingEntries = JSON.parse(existingEntriesRaw) as RecognitionEntry[];
  } catch {
    existingEntries = [];
  }
  try {
    requestedTerms = JSON.parse(requestedTermsRaw) as string[];
  } catch {
    requestedTerms = [];
  }
  try {
    imageMetadata = JSON.parse(imageMetadataRaw) as ImageUploadMetadata[];
  } catch {
    imageMetadata = [];
  }

  const envModelOption =
    normalizeModelOverride(process.env.ARK_MODEL) ??
    normalizeModelOverride(process.env.NEXT_PUBLIC_ARK_MODEL) ??
    getArkModelOption(DEFAULT_ARK_MODEL);
  const selectedModelOption =
    normalizeModelOverride(requestedModel) ??
    envModelOption ??
    getArkModelOption(DEFAULT_ARK_MODEL);

  if (!selectedModelOption) {
    return NextResponse.json(
      {
        error: "当前模型配置不可用，请重新选择一个有效模型后再试。",
      },
      { status: 500 },
    );
  }

  const providerApiKey =
    selectedModelOption.provider === "agnes"
      ? process.env.AGNES_API_KEY
      : process.env.ARK_API_KEY;
  const providerBaseUrl =
    selectedModelOption.provider === "agnes"
      ? process.env.AGNES_BASE_URL ??
        process.env.NEXT_PUBLIC_AGNES_BASE_URL ??
        selectedModelOption.defaultBaseUrl
      : process.env.ARK_BASE_URL ??
        process.env.NEXT_PUBLIC_ARK_BASE_URL ??
        selectedModelOption.defaultBaseUrl;

  if (!providerApiKey || !providerBaseUrl) {
    return NextResponse.json(
      {
        error:
          selectedModelOption.provider === "agnes"
            ? "缺少 Agnes 环境变量。请在项目根目录 .env.local 中配置 AGNES_API_KEY，必要时补充 AGNES_BASE_URL。"
            : "缺少 Ark 环境变量。请在项目根目录 .env.local 中配置 ARK_API_KEY、ARK_BASE_URL、ARK_MODEL。",
      },
      { status: 500 },
    );
  }

  const apiKey = providerApiKey;
  const baseUrl = normalizeBaseUrlOverride(requestedBaseUrl, providerBaseUrl);
  const selectedModel = selectedModelOption.value;
  const apiModel = selectedModelOption.apiModel;
  const visionModelOption = selectedModelOption;
  const visionModel = visionModelOption.apiModel;
  const isAppendRequest = files.length === 0 && requestedTerms.length > 0 && !directTermMode;

  try {
    let transcript = "";
    let fileName =
      sourceFileName ||
      (directTermMode && requestedTerms.length > 0 ? requestedTerms.join("、") : "继续追加词汇");
    let ocrMethod: OcrMethod = "vision";
    let cleanedText = "";
    let entries: StructuredEntry[] = [];
    let properNouns: StructuredEntry[] = [];
    let mode: "vision" | "vision-fallback" = "vision";
    let effectiveModelOptionForResponse = selectedModelOption;
    let diagnostics: AnalysisDiagnostics = {
      imageCount: files.length,
      images: imageMetadata,
      files: [],
      ocrTextLength: 0,
      ocrTextLines: 0,
      ocrSentenceCount: 0,
      aiInputLength: 0,
      aiInputSentenceCount: 0,
      aiSeedEntryCount: 0,
      aiOutputCount: 0,
      finalDisplayCount: 0,
      coveredSentenceCount: 0,
      uncoveredSentenceCount: 0,
      coveredSentences: [],
      uncoveredSentences: [],
      method: "vision",
    };

    if (stage2Enrich && existingEntries.length > 0) {
      const stagedEntries = (existingEntries as StructuredEntry[]).map((entry) =>
        sanitizeStructuredEntry(entry),
      );
      transcript = cleanTranscript(
        existingRawText ||
          stagedEntries.map((entry) => normalizeSentence(entry.sentence)).join("\n\n"),
      );
      cleanedText = transcript;
      entries = stagedEntries
        .filter((entry) => (entry.category ?? "learning") !== "proper-noun")
        .map((entry) => applyLearningEntryDefaults(entry));
      properNouns = stagedEntries
        .filter((entry) => entry.category === "proper-noun")
        .map((entry) => applyProperNounEntryDefaults(entry));
      mode = "vision-fallback";
      ocrMethod = "vision";
    } else if (directTermMode && requestedTerms.length > 0) {
      const directEntries = await generateEntriesForRequestedTermsDirect({
        apiKey,
        baseUrl,
        model: apiModel,
        requestedTerms,
        instructions,
      });
      entries = filterValidEntries(directEntries);
      cleanedText = directEntries.map((entry) => entry.sentence.trim()).join("\n");
      transcript = cleanedText;
      mode = "vision-fallback";
    } else if (files.length > 0) {
      effectiveModelOptionForResponse = visionModelOption;
      const analysis = await analyzeImageFilesDirectly({
        apiKey,
        baseUrl,
        model: visionModel,
        files,
        instructions,
        existingEntries,
        preferOcrFirst: ocrFirst || !preferVision,
        preferVision,
        imageMetadata,
        fastMode,
        directJsonMode,
      });
      transcript = analysis.rawText;
      cleanedText = analysis.rawText;
      entries = directJsonMode
        ? sortEntriesByTranscriptOrder(
            analysis.rawText,
            dedupeLearningEntries(
              (analysis.entries ?? []).map((entry) => applyLearningEntryDefaults(entry)),
            ),
          )
        : sortEntriesByTranscriptOrder(
            analysis.rawText,
            dedupeLearningEntries(
              filterDisplayEntries(
                analysis.entries,
              ),
            ),
          );
      properNouns = directJsonMode
        ? dedupeLearningEntries(
            (analysis.properNouns ?? []).map((entry) => applyProperNounEntryDefaults(entry)),
          )
        : filterProperNounEntries(analysis.properNouns ?? []);
      ocrMethod = analysis.method;
      diagnostics = analysis.diagnostics;
      fileName =
        files.length === 1
          ? files[0]?.name ?? "图片识别结果"
          : `${files[0]?.name ?? "多图"} 等 ${files.length} 个文件`;
    } else if (localHeuristic && existingRawText) {
      transcript = cleanTranscript(existingRawText);
      cleanedText = transcript;
      ocrMethod = "tesseract";
      mode = "vision-fallback";
    } else if (existingRawText) {
      transcript = existingRawText;
      cleanedText = existingRawText;
    } else {
      return NextResponse.json({ error: "请先上传图片或选择已有任务继续追加。" }, { status: 400 });
    }

    if (directTermMode && entries.length === 0) {
      return NextResponse.json(
        {
          error: "没有成功为你输入的词汇生成词条，请换一个词或短语再试。",
        },
        { status: 422 },
      );
    }

    if ((!transcript || transcript === "EMPTY") && entries.length === 0 && properNouns.length === 0) {
      return NextResponse.json(
        {
          error:
            "Doubao 已完成图片识别，但没有读到足够清晰的英文正文。请换一张只包含正文、分辨率更高的英文截图再试。",
        },
        { status: 422 },
      );
    }

    const rawText =
      transcript && transcript !== "EMPTY"
        ? transcript
        : cleanTranscript(
            [
              ...entries.map((entry) => entry.sentence),
              ...properNouns.map((entry) => entry.sentence),
            ].join("\n\n"),
          );

    if (files.length === 0 && requestedTerms.length > 0 && !directTermMode) {
      const requestedEntries = extractRequestedTermEntries({
        transcript,
        requestedTerms,
        existingEntries,
      });

      const missingRequestedTerms = findMissingRequestedTerms(requestedTerms, requestedEntries);
      let supplementalEntries: StructuredEntry[] = [];

      if (missingRequestedTerms.length > 0) {
        supplementalEntries = await generateEntriesForRequestedTermsDirect({
          apiKey,
          baseUrl,
          model: apiModel,
          requestedTerms: missingRequestedTerms,
          instructions,
        });
      }

      const requestedCandidates = filterAppendRequestedEntries([
        ...requestedEntries,
        ...supplementalEntries,
      ]);

      let mergedRequestedEntries = requestedCandidates;

      if (requestedCandidates.length > 0) {
        const enrichedRequestedEntries = await fillCandidateEntriesWithModel({
          apiKey,
          baseUrl,
          model: apiModel,
          entries: requestedCandidates,
        }).catch(() => [] as StructuredEntry[]);

        if (enrichedRequestedEntries.length > 0) {
          mergedRequestedEntries = filterAppendRequestedEntries(
            mergeEntryDetails(requestedCandidates, enrichedRequestedEntries),
          );
        }

        const requestedEntriesNeedingRepair = mergedRequestedEntries.filter(
          (entry) =>
            isLowQualityChineseMeaning(entry.vocabulary, entry.chinese) ||
            sharedIsLowQualityExample(entry.sentence, entry.example) ||
            !(entry.sentenceChinese ?? "").trim() ||
            !(entry.exampleChinese ?? "").trim() ||
            !(entry.partOfSpeech ?? "").trim(),
        );

        if (requestedEntriesNeedingRepair.length > 0) {
          const repairedRequestedEntries = await repairEntriesWithModel({
            apiKey,
            baseUrl,
            model: apiModel,
            entries: requestedEntriesNeedingRepair.slice(0, 8),
          }).catch(() => [] as StructuredEntry[]);

          if (repairedRequestedEntries.length > 0) {
            mergedRequestedEntries = filterAppendRequestedEntries(
              mergeEntryDetails(mergedRequestedEntries, repairedRequestedEntries),
            );
          }
        }
      }

      if (mergedRequestedEntries.length > 0) {
        entries = filterEntriesToRequestedTerms(
          requestedTerms,
          mergedRequestedEntries,
        );
        mode = "vision-fallback";
      }
    }

    if (files.length === 0 && entries.length === 0 && !isAppendRequest && !stage2Enrich) {
      try {
        const enrichedTranscriptResult = await enrichEntriesForImageTranscript({
          apiKey,
          baseUrl,
          model: apiModel,
          transcript,
          instructions,
          existingEntries,
        });
        entries = enrichedTranscriptResult.entries;
        properNouns = enrichedTranscriptResult.properNouns;
        cleanedText = transcript;
      } catch {
        if (entries.length === 0) {
          mode = "vision-fallback";
        }
      }
    }

    if (isAppendRequest) {
      entries = filterEntriesToRequestedTerms(requestedTerms, entries);
      properNouns = filterEntriesToRequestedTerms(requestedTerms, properNouns);

      if (entries.length === 0 && properNouns.length === 0) {
        const directEntries = await generateEntriesForRequestedTermsDirect({
          apiKey,
          baseUrl,
          model: apiModel,
          requestedTerms,
          instructions,
        }).catch(() => [] as StructuredEntry[]);

        if (directEntries.length > 0) {
          entries = filterValidEntries(directEntries);
          properNouns = [];
          mode = "vision-fallback";
        } else {
          return NextResponse.json(
            {
              error: "没有在当前原文中定位到你指定的词汇或短语，也没能直接生成对应词条，请换一个表达后再试。",
            },
            { status: 422 },
          );
        }
      }
    }

    if (entries.length === 0 && !isAppendRequest && !stage2Enrich && !directJsonMode) {
      const fallbackEntries = createFallbackEntries(transcript);
      properNouns = filterProperNounEntries([...properNouns, ...fallbackEntries]);
      properNouns = await enrichProperNounEntriesWithModel({
        apiKey,
        baseUrl,
        model: apiModel,
        entries: properNouns,
      }).catch(() => properNouns);
      entries = filterValidEntries(fallbackEntries);
      if (entries.length === 0) {
        const deterministicLearningEntries = buildRawTranscriptCandidateEntries({
          transcript,
          existingEntries,
          currentEntries: entries,
          limit: Math.min(getDesiredEntryCount(transcript), 24),
        });
        const enrichedFallbackEntries = await enrichDisplayEntriesWithModel({
          apiKey,
          baseUrl,
          model: apiModel,
          entries: deterministicLearningEntries,
        }).catch(() => [] as StructuredEntry[]);

        entries =
          enrichedFallbackEntries.length > 0
            ? filterValidEntries(enrichedFallbackEntries)
            : filterDisplayEntries(deterministicLearningEntries);
      }
      if (entries.length === 0 && !ocrFirst && !localHeuristic) {
        entries = await ensureHighQualityEntries({
          apiKey,
          baseUrl,
          model: apiModel,
          entries: fallbackEntries,
          allowRepair: true,
          repairLimit: 4,
        });
      }
      mode = "vision-fallback";
    }

    if (entries.length === 0 && properNouns.length > 0 && !isAppendRequest && !stage2Enrich && !directJsonMode) {
      const forcedLearningEntries = buildRawTranscriptCandidateEntries({
        transcript,
        existingEntries,
        currentEntries: [],
        limit: Math.min(getDesiredEntryCount(transcript), 24),
      });
      const enrichedForcedLearningEntries = await enrichDisplayEntriesWithModel({
        apiKey,
        baseUrl,
        model: apiModel,
        entries: forcedLearningEntries,
      }).catch(() => [] as StructuredEntry[]);

      entries =
        enrichedForcedLearningEntries.length > 0
          ? filterValidEntries(enrichedForcedLearningEntries)
          : filterDisplayEntries(forcedLearningEntries);
    }

    if (entries.length > 0 && files.length === 0 && !ocrFirst && !localHeuristic && !isAppendRequest && !stage2Enrich && !directJsonMode) {
      entries = await ensureHighQualityEntries({
        apiKey,
        baseUrl,
        model: apiModel,
        entries,
        allowRepair: true,
        repairLimit: files.length > 0 ? 4 : 6,
      });
    }

    if (properNouns.length > 0 && !isAppendRequest && files.length === 0 && !directJsonMode) {
      properNouns = await enrichProperNounEntriesWithModel({
        apiKey,
        baseUrl,
        model: apiModel,
        entries: properNouns,
      }).catch(() => properNouns);
    }

    if (entries.length > 0 && !directJsonMode) {
      const incompleteLearningEntries = entries.filter(
        (entry) =>
          isLowQualityChineseMeaning(entry.vocabulary, entry.chinese) ||
          sharedIsLowQualityExample(entry.sentence, entry.example) ||
          !(entry.sentenceChinese ?? "").trim() ||
          !(entry.exampleChinese ?? "").trim() ||
          !(entry.partOfSpeech ?? "").trim(),
      );

      if (incompleteLearningEntries.length > 0) {
        const repairedLearningEntries = await repairEntriesWithModel({
          apiKey,
          baseUrl,
          model: apiModel,
          entries: incompleteLearningEntries,
        }).catch(() => [] as StructuredEntry[]);

        if (repairedLearningEntries.length > 0) {
          entries = stage2Enrich
            ? dedupeLearningEntries(mergePreferredEntries(repairedLearningEntries, entries))
            : filterDisplayEntries(
                mergePreferredEntries(repairedLearningEntries, entries),
              );
        }
      }
    }

    const combinedEntriesBeforeDisplay = directJsonMode
      ? sortEntriesByTranscriptOrder(
          rawText,
          dedupeLearningEntries([
            ...entries,
            ...properNouns.map((entry) => ({
              ...entry,
              category: "learning" as const,
            })),
          ]),
        )
      : dedupeLearningEntries([
          ...entries,
          ...properNouns.map((entry) => ({
            ...entry,
            category: "learning" as const,
          })),
        ]);

    const shouldAddSentenceCoverageFallback =
      !stage2Enrich &&
      !directJsonMode &&
      files.length === 0 &&
      (
        combinedEntriesBeforeDisplay.length <
          Math.max(Math.ceil(splitTranscriptSentences(rawText).length * 2), 8) ||
        countCoveredSentences(combinedEntriesBeforeDisplay) <
          Math.max(2, Math.floor(splitTranscriptSentences(rawText).length * 0.6))
      );

    const sentenceCoverageFallbackEntries = shouldAddSentenceCoverageFallback
      ? buildSentenceCoverageFallbackEntries({
          transcript: rawText,
          currentEntries: combinedEntriesBeforeDisplay,
        })
      : [];

    const combinedEntriesWithCoverage = dedupeLearningEntries([
      ...combinedEntriesBeforeDisplay,
      ...sentenceCoverageFallbackEntries,
    ]);

    const displayEntriesNeedingRepair = combinedEntriesWithCoverage.filter(
      (entry) =>
        isLowQualityChineseMeaning(entry.vocabulary, entry.chinese) ||
        sharedIsLowQualityExample(entry.sentence, entry.example) ||
        !(entry.sentenceChinese ?? "").trim() ||
        !(entry.exampleChinese ?? "").trim() ||
        !(entry.partOfSpeech ?? "").trim(),
    );

    let repairedDisplayEntries = combinedEntriesWithCoverage;
    if (displayEntriesNeedingRepair.length > 0 && !directJsonMode) {
      const finalRepairedEntries = await repairEntriesWithModel({
        apiKey,
        baseUrl,
        model: apiModel,
        entries: displayEntriesNeedingRepair,
      }).catch(() => [] as StructuredEntry[]);

      if (finalRepairedEntries.length > 0) {
        repairedDisplayEntries = mergePreferredEntries(
          finalRepairedEntries,
          combinedEntriesWithCoverage,
        );
      }
    }

    const entriesNeedingChineseMeaning = repairedDisplayEntries.filter((entry) =>
      isLowQualityChineseMeaning(entry.vocabulary, entry.chinese),
    );

    let combinedEntriesForDisplay = repairedDisplayEntries;
    if (entriesNeedingChineseMeaning.length > 0 && !directJsonMode) {
      const repairedChineseEntries = await repairChineseMeaningsWithModel({
        apiKey,
        baseUrl,
        model: apiModel,
        entries: entriesNeedingChineseMeaning,
      }).catch(() => [] as StructuredEntry[]);

      if (repairedChineseEntries.length > 0) {
        combinedEntriesForDisplay = mergePreferredEntries(
          repairedChineseEntries,
          repairedDisplayEntries,
        );
      }
    }

    const mergedDisplayEntries = sortEntriesByTranscriptOrder(
      rawText,
      directJsonMode
        ? combinedEntriesForDisplay.map((entry) => applyLearningEntryDefaults(entry))
        : ensureDisplayableEntryDetails(combinedEntriesForDisplay),
    );
    const totalExtractedCount = mergedDisplayEntries.length;

    if (totalExtractedCount === 0) {
      const likelyUiScreenshot =
        isLikelyAuraWorkspaceScreenshot(rawText) ||
        diagnostics.files.some((file) =>
          isLikelyAuraWorkspaceScreenshot(
            [
              file.ocr?.preview,
              file.visionDefault?.preview,
              file.visionExhaustive?.preview,
              file.mergedTranscript?.preview,
            ]
              .filter(Boolean)
              .join(" "),
          ),
        );

      if (likelyUiScreenshot) {
        return NextResponse.json(
          {
            error:
              "你上传的更像是 Aura 页面本身的界面截图，不是只包含英文正文的原始图片，所以当前没有可提取的英文材料。请直接上传新闻原文截图本身，而不是包含 Aura 操作界面的截图。",
            diagnostics,
          },
          { status: 422 },
        );
      }

      return NextResponse.json(
        {
          error:
            "Doubao 已读到图片内容，但没有成功提取出可用词汇。建议换更清晰的截图，或减少一张图里的文字密度。",
          diagnostics,
        },
        { status: 422 },
      );
    }

    diagnostics = {
      ...diagnostics,
      aiInputLength: rawText.length,
      aiInputSentenceCount: splitTranscriptSentences(rawText).length,
      aiOutputCount: totalExtractedCount,
      finalDisplayCount: totalExtractedCount,
      method: ocrMethod,
    };

    console.info(
      "[analyze] image-chain diagnostics",
      JSON.stringify({
        fileName,
        model: effectiveModelOptionForResponse.value,
        resolvedModel: effectiveModelOptionForResponse.apiModel,
        visionModel: visionModelOption.value,
        resolvedVisionModel: visionModel,
        serverTesseractEnabled: canUseServerTesseract(),
        diagnostics,
      }),
    );

    return NextResponse.json({
      fileName,
      rawText,
      cleanedText: cleanedText || rawText,
      entries: normalizeEntries(mergedDisplayEntries),
      properNouns: [],
      mode,
      effectiveModel: effectiveModelOptionForResponse.value,
      effectiveVisionModel: visionModelOption.value,
      resolvedModelId: effectiveModelOptionForResponse.apiModel,
      resolvedVisionModelId: visionModel,
      ocrMethod,
      feishuLink,
      diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const normalizedMessage =
      message.includes("aborted due to timeout") || message.includes("The operation was aborted")
        ? (isAppendRequest || directTermMode)
          ? "词条生成超时。请重试一次；如果仍失败，请换一个更短的词或短语后再试。"
          : "图片分析超时。当前已自动尝试直连识别与原文重建兜底，但这次仍未在时限内完成。请重试一次。"
        : `图片分析失败：${message}`;
    return NextResponse.json(
      {
        error: normalizedMessage,
        effectiveModel: files.length > 0 ? visionModelOption.value : selectedModel,
        effectiveVisionModel: visionModelOption.value,
        resolvedModelId: files.length > 0 ? visionModel : apiModel,
        resolvedVisionModelId: visionModel,
      },
      { status: 500 },
    );
  }
}
