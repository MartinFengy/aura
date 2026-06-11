import { NextResponse } from "next/server";
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
};

type OcrMethod = "vision" | "tesseract";

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
  "trump administration": "特朗普政府",
  "iran war": "伊朗战争",
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
  attacked: "袭击了；攻击了",
  expletives: "脏话；咒骂语",
  perturbed: "不安的；烦恼的",
  criticizing: "批评；指责",
  admitted: "承认；坦言",
  disputed: "质疑；反驳",
  continuing: "持续进行",
  seized: "查获；扣押",
  vet: "审查；审核",
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
  /\bTrump administration\b/i,
  /\bIran war\b/i,
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
  blow: "打击",
  capitol: "国会山",
  ceasefire: "停火",
  concerns: "担忧",
  depot: "仓库",
  diplomatic: "外交的",
  disputes: "争议",
  drones: "无人机",
  edge: "优势",
  escalation: "升级",
  executive: "行政的",
  federal: "联邦的",
  fire: "大火",
  government: "政府",
  hill: "山；国会山",
  igniting: "引发",
  intelligence: "智能",
  investigators: "调查人员",
  iran: "伊朗",
  israeli: "以色列的",
  lebanon: "黎巴嫩",
  major: "重大",
  marco: "马可",
  mediators: "调解人",
  mexican: "墨西哥的",
  military: "军事的",
  national: "国家的",
  nuclear: "核",
  oil: "石油",
  optimistic: "乐观的",
  order: "命令",
  peace: "和平",
  petersburg: "彼得堡",
  policy: "政策",
  president: "总统",
  prime: "总理",
  public: "公开的",
  release: "发布",
  reported: "报道",
  resumption: "恢复",
  risks: "风险",
  rubio: "鲁比奥",
  security: "安全",
  semiofficial: "半官方的",
  seized: "查获",
  secretary: "国务卿",
  similar: "类似的",
  southern: "南部的",
  state: "国务",
  attack: "袭击；攻击",
  struck: "袭击",
  talks: "谈判",
  technology: "技术",
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
  "are",
  "as",
  "at",
  "be",
  "because",
  "by",
  "for",
  "from",
  "he",
  "her",
  "his",
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
  "was",
  "were",
  "with",
]);

function normalizeModelOverride(value: string) {
  return getArkModelOption(value.trim());
}

function normalizeBaseUrlOverride(value: string, fallbackBaseUrl: string) {
  const normalized = value.trim();
  if (!normalized) {
    return fallbackBaseUrl;
  }

  try {
    const fallbackUrl = new URL(fallbackBaseUrl);
    const candidateUrl = new URL(normalized);

    if (candidateUrl.protocol !== "https:") {
      return fallbackBaseUrl;
    }

    if (candidateUrl.host !== fallbackUrl.host) {
      return fallbackBaseUrl;
    }

    return candidateUrl.toString().replace(/\/$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

function extractJsonPayload(content: string) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1);
  }

  return content;
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
  }));
}

function normalizeSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function collapseRepeatedSentenceFragments(value: string) {
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

function normalizeVocabulary(value: string) {
  return value
    .replace(/[“”’']/g, "")
    .replace(/[.,;:!?()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSentenceForComparison(value: string) {
  return value
    .replace(/[“”‘’"']/g, "")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

  if (normalizedVocabulary.endsWith("ed") || normalizedVocabulary.endsWith("ing")) {
    return "";
  }

  if (normalizedVocabulary.endsWith("tion")) {
    return "";
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

  return translatedWords.join("；");
}

function tokenizeVocabularyWords(value: string) {
  return value.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
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
      "communicating",
      "criticizing",
      "diplomatic",
      "escalation",
      "evacuation",
      "expletives",
      "grilled",
      "mediators",
      "optimistic",
      "perturbed",
      "radicalized",
      "resumption",
      "shooting",
      "semiofficial",
      "supremacist",
      "uncovered",
      "seized",
      "vet",
      "wildfire",
    ].includes(normalized)
  ) {
    return true;
  }

  return (
    normalized.length >= 8 &&
    /(tion|sion|ment|ance|ence|ality|ative|izing|ating|ized|edly|fully|ship|tive)$/.test(
      normalized,
    )
  );
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

  const genericWordCount = words.filter((word) => GENERIC_HEURISTIC_WORDS.has(word.toLowerCase())).length;
  const stopwordCount = words.filter((word) => PHRASE_EDGE_STOPWORDS.has(word.toLowerCase())).length;
  score -= genericWordCount * 8;
  if (words.length >= 3 && stopwordCount >= 2) {
    score -= 45;
  }
  if (/^(?:said|reported|described|allowed|stopped|have|was|were)\b/i.test(candidate)) {
    score -= 45;
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

  if (normalized === normalizedSentenceFallback(sentence)) {
    score -= 10;
  }

  return score;
}

function normalizedSentenceFallback(sentence: string) {
  return normalizeVocabulary(sentence).toLowerCase();
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

  if (!normalizedEntrySentence || comparableEntrySentence !== comparableSentence) {
    return false;
  }

  if (isLowQualitySourceSentence(normalizedSentence)) {
    return false;
  }

  if (!vocabulary || !lowerSentence.includes(lowerVocabulary)) {
    return false;
  }

  if (wordCount > 5) {
    return false;
  }

  if (isLowQualityChineseMeaning(vocabulary, entry.chinese)) {
    return false;
  }

  if (sharedIsLowQualityExample(normalizedSentence, entry.example)) {
    return false;
  }

  if (firstTwoWords && lowerVocabulary === firstTwoWords && wordCount < 3) {
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
    pronunciation:
      entry.pronunciation?.trim() || `${vocabulary}. ${example || sentence}. ${sentence}`,
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

  const phraseMatches =
    trimmedSentence.match(/\b[A-Za-z-]{5,}(?:\s+[A-Za-z-]{4,}){1,2}\b/g) ?? [];
  candidates.push(...phraseMatches);

  const words = tokenizeVocabularyWords(trimmedSentence);
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      const phraseWords = tokenizeVocabularyWords(phrase);
      const firstPhraseWord = phraseWords[0]?.toLowerCase() ?? "";
      const lastPhraseWord = phraseWords.at(-1)?.toLowerCase() ?? "";
      const capitalizedCount = phraseWords.filter((word) => /^[A-Z]/.test(word)).length;
      if (
        phraseWords.length >= 2 &&
        !PHRASE_EDGE_STOPWORDS.has(firstPhraseWord) &&
        !PHRASE_EDGE_STOPWORDS.has(lastPhraseWord) &&
        phraseWords.some((word) => word.length >= 6 || /^[A-Z]/.test(word)) &&
        !(capitalizedCount >= 1 && capitalizedCount < phraseWords.length && /^[A-Z]/.test(phraseWords[0] ?? ""))
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

    const score = scoreHeuristicCandidate(candidate, trimmedSentence);
    if (score < 34) {
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
    .slice(0, 8);
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
    /\b(?:[A-Z]\.){2,}|\bSt\./g,
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
  const existingKeys = new Set(
    params.existingEntries.map((entry) => normalizeVocabulary(entry.vocabulary).toLowerCase()),
  );

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
    if (!normalizedVocabulary || existingKeys.has(normalizedVocabulary)) {
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

  return filterValidEntries(resolvedEntries);
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

function getDesiredEntryCount(transcript: string) {
  const sentenceCount = splitTranscriptSentences(transcript).length;
  if (sentenceCount <= 1) {
    return 6;
  }

  return Math.min(Math.max(sentenceCount * 3, 12), 30);
}

function filterValidEntries(entries: StructuredEntry[]) {
  return dedupeLearningEntries(
    entries
      .map((entry) => sanitizeStructuredEntry(entry))
      .filter((entry) => isValidLearningEntry(entry.sentence, entry)),
  );
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
    const vocabularies = extractHeuristicVocabularies(sentence).slice(0, 6);
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

      if (candidates.length >= (params.limit ?? 18)) {
        return candidates;
      }
    }
  }

  return candidates;
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
      timeoutMs: 12000,
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
      "example": "string",
      "pronunciation": "string"
    }
  ]
}

Repair the following vocabulary cards.

Rules:
1. sentence must stay exactly the same as provided.
2. vocabulary must stay exactly the same as provided.
3. chinese must be a concise and accurate Chinese meaning.
4. example must be a new natural English example sentence, different from sentence.
5. pronunciation should be short TTS-friendly readable English text.
6. Do not output placeholders, fragments, OCR garbage, or generic fake examples.
7. If you cannot repair an item accurately, return empty strings for chinese and example for that item.
8. Return JSON only.

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

  const payload = await callArkJson({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 14000,
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
      "example": "string",
      "pronunciation": "string"
    }
  ]
}

Fill the following candidate vocabulary cards.

Rules:
1. sentence must stay exactly the same as provided.
2. vocabulary must stay exactly the same as provided.
3. chinese must be an accurate, concise Chinese meaning. Do not transliterate blindly unless it is a well-known proper noun.
4. example must be a new natural English sentence, different from the original sentence.
5. pronunciation should be short TTS-friendly readable English text.
6. Prefer educationally meaningful proper nouns, place names, personal names, official titles, institutions, and advanced phrases.
7. If an item is not reliable enough, keep chinese and example empty instead of guessing.
8. Return JSON only.

Candidates:
${JSON.stringify(params.entries, null, 2)}
        `.trim(),
      },
    ],
  }).catch(() => ({ entries: [] as StructuredEntry[] }));

  return filterValidEntries((payload.entries ?? []) as StructuredEntry[]);
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
    limit: params.limit ?? 12,
  });

  if (candidates.length === 0) {
    return [];
  }

  return fillCandidateEntriesWithModel({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    entries: candidates,
  });
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
    signal: AbortSignal.timeout(params.timeoutMs ?? 45000),
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
    timeoutMs: 28000,
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
    return "";
  }

  try {
    const payload = JSON.parse(extractJsonPayload(content)) as { cleanedText?: string };
    return cleanTranscript(payload.cleanedText ?? "");
  } catch {
    const rawText = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/\}\s*$/g, "")
      .trim()
      .replace(/^"+|"+$/g, "");
    return cleanTranscript(rawText);
  }
}

async function extractTextFromImageWithAiFallback(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  buffer: Buffer;
  fileType: string;
}) {
  const primaryTranscript = await extractTextFromImageWithModel(params).catch(() => "");
  const primarySentenceCount = splitTranscriptSentences(primaryTranscript).length;

  if (!primaryTranscript) {
    return "";
  }

  if (primarySentenceCount <= 2 || primaryTranscript.length < 360) {
    const exhaustiveTranscript = await extractTextFromImageWithModel({
      ...params,
      coverageMode: "exhaustive",
    }).catch(() => "");

    if (exhaustiveTranscript) {
      return mergeTranscriptVariants(primaryTranscript, exhaustiveTranscript);
    }
  }

  return primaryTranscript;
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
    timeoutMs: 16000,
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
  "entries": [
    {
      "sentence": "string",
      "vocabulary": "string",
      "chinese": "string",
      "example": "string",
      "pronunciation": "string"
    }
  ]
}

Rules:
1. Keep only useful English learning content visible in the image.
2. Ignore icons, logos, timestamps, decorative UI, page chrome, watermarks, and garbage fragments.
3. cleanedText must restore all readable original English sentences from top to bottom, including the lower half of a long screenshot.
4. sentence must be a complete meaningful original sentence from the image text.
5. Do not drop the later sentences in a long image, and do not repeat sentence fragments.
6. Every entry sentence must appear verbatim inside cleanedText.
7. vocabulary must be one advanced word or phrase at or above high-school English level from that sentence.
8. chinese must be concise Chinese meaning.
9. example must be one new natural English example sentence.
10. pronunciation must be a short TTS-friendly English text.
11. Extract as many qualified words and phrases as possible across every sentence.
12. Prefer 2 to 5 strong items from each information-rich sentence whenever they truly exist.
13. Proper nouns and named entities are strongly encouraged when educationally meaningful: person names, place names, institutions, official titles, organizations, and geopolitical regions.
14. If the image already looks like vocabulary cards or notes, preserve the visible meaning and examples accurately.
15. If the user explicitly requests certain words or phrases, prioritize those requested items first.
16. Return JSON only.

User instructions:
${params.instructions || "请尽可能多提取每句话里高中及以上水平的高质量单词和短语，并包含专有名词、人名、地名、机构名、头衔等有学习价值的表达。"}

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
  const tesseract = await import("tesseract.js");
  const result = await tesseract.default.recognize(buffer, "eng");
  return cleanTranscript(result.data.text || "");
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
    timeoutMs: 14000,
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
  "entries": [
    {
      "sentence": "string",
      "vocabulary": "string",
      "chinese": "string",
      "example": "string",
      "pronunciation": "string"
    }
  ]
}

Rules:
1. Keep only useful English learning content.
2. sentence must be a complete meaningful original sentence from the provided text.
3. vocabulary must be one advanced word or phrase at or above high-school English level from that sentence.
4. chinese must be concise Chinese meaning.
5. example must be one new natural English example sentence.
6. pronunciation must be a short TTS-friendly English text for reading aloud.
7. Extract as many qualified words and phrases as possible across every sentence. Return 12 to 36 entries when possible.
8. If appendOnly is true, only return NEW entries that do not duplicate the existing list.
9. Keep the result accurate and do not invent original sentences.
10. It is allowed and encouraged to extract high-quality proper nouns and named entities when they are educationally valuable, such as person names, place names, institutions, official titles, products, treaties, and geopolitical regions.
11. Prefer 2 to 4 items from each information-rich sentence when they truly exist.
12. Cover as many sentences as possible instead of returning only one item from the whole passage.
13. If the user explicitly requests certain words or phrases, prioritize those requested items first, then supplement with other strong candidates from the same sentence.

Text:
${params.transcript}

appendOnly:
${params.appendOnly ? "true" : "false"}

User instructions:
${params.instructions || "请尽可能多提取每句话里高中及以上水平的高质量单词和短语，并包含专有名词、人名、地名、机构名、头衔等有学习价值的表达。"}

Existing entries to avoid duplicating:
${existingVocabulary || "none"}
        `.trim(),
      },
    ],
  });
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
  let entries = filterValidEntries(params.seedEntries ?? []);

  if (!transcript) {
    return entries;
  }

  const expectedCoverage = Math.min(Math.max(sentenceCount - 1, 1), 8);
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
    }).catch(() => ({ entries: [] as StructuredEntry[] }));

    entries = filterValidEntries([...entries, ...(structured.entries ?? [])]);
  }

  const stillNeedsMoreEntries =
    entries.length < Math.max(Math.ceil(desiredEntryCount * 0.75), 10) ||
    countCoveredSentences(entries) < expectedCoverage;

  if (stillNeedsMoreEntries) {
    const supplementalEntries = await supplementEntriesFromTranscript({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      transcript,
      existingEntries: params.existingEntries,
      currentEntries: entries,
      limit: Math.max(desiredEntryCount - entries.length, 10),
    }).catch(() => [] as StructuredEntry[]);

    entries = filterValidEntries([...entries, ...supplementalEntries]);
  }

  return entries.slice(0, Math.min(Math.max(desiredEntryCount, 18), 36));
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
      "example": "string",
      "pronunciation": "string"
    }
  ]
}

Generate one entry for each requested term or phrase below.

Rules:
1. vocabulary must exactly match or preserve the intended requested term/phrase.
2. sentence must be one complete, natural English sentence using that term.
3. chinese must be a direct, concise Chinese meaning.
4. example must be a second new natural English example sentence, different from sentence.
5. pronunciation should be short TTS-friendly text, ideally: "vocabulary. sentence. example."
6. Do not rely on any source article or original text.
7. Do not add extra terms that were not requested.
8. Return JSON only.

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
}) {
  if (params.preferVision) {
    const results = await Promise.all(
      params.files.map(async (file) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const transcript = await extractTextFromImageWithAiFallback({
          apiKey: params.apiKey,
          baseUrl: params.baseUrl,
          model: params.model,
          buffer,
          fileType: file.type,
        }).catch(() => "");

        if (transcript) {
          const entries = filterValidEntries(createFallbackEntries(transcript));
          return {
            transcript,
            entries,
            method: "vision" as const,
          };
        }

        return {
          transcript: "",
          entries: [],
          method: "vision" as const,
        };
      }),
    );

    const validResults = results.filter((item) => item.transcript);

    const mergedTranscript = cleanTranscript(
      validResults.map((item) => item.transcript).join("\n\n"),
    );
    const seedEntries = mergedTranscript
      ? filterValidEntries([
          ...validResults.flatMap((item) => item.entries),
          ...createFallbackEntries(mergedTranscript),
        ])
      : [];
    const entries = mergedTranscript
      ? await enrichEntriesForImageTranscript({
          apiKey: params.apiKey,
          baseUrl: params.baseUrl,
          model: params.model,
          transcript: mergedTranscript,
          instructions: params.instructions,
          existingEntries: params.existingEntries,
          seedEntries,
        })
      : [];

    return {
      rawText: mergedTranscript,
      cleanedText: mergedTranscript,
      entries,
      method: "vision" as const,
    };
  }

  if (params.preferOcrFirst) {
    const transcripts = await Promise.all(
      params.files.map(async (file) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        return transcribeImageWithTesseract(buffer).catch(() => "");
      }),
    );

    const mergedTranscript = transcripts
      .map((text) => cleanTranscript(text))
      .filter(Boolean)
      .join("\n\n")
      .trim();

    let entries: StructuredEntry[] = [];
    if (mergedTranscript) {
      const structured = await structureTranscript({
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        model: params.model,
        transcript: mergedTranscript,
        instructions: params.instructions,
        existingEntries: params.existingEntries,
        appendOnly: Boolean(params.existingEntries?.length),
      }).catch(() => ({ cleanedText: mergedTranscript, entries: [] as StructuredEntry[] }));

      entries = filterValidEntries(structured.entries ?? []);

      const desiredEntryCount = getDesiredEntryCount(mergedTranscript);
      const coveredSentences = countCoveredSentences(entries);
      const sentenceCount = splitTranscriptSentences(mergedTranscript).length;
      if (
        entries.length < desiredEntryCount ||
        coveredSentences < Math.min(Math.max(sentenceCount - 1, 1), 8)
      ) {
        const supplementalEntries = createFallbackEntries(mergedTranscript);
        entries = filterValidEntries([...entries, ...supplementalEntries]).slice(
          0,
          desiredEntryCount,
        );
      }
    }

    if (entries.length === 0 && mergedTranscript) {
      entries = filterValidEntries(createFallbackEntries(mergedTranscript)).slice(
        0,
        getDesiredEntryCount(mergedTranscript),
      );
    }

    return {
      rawText: mergedTranscript,
      cleanedText: mergedTranscript,
      entries,
      method: "tesseract" as const,
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
          entries: payload.entries ?? [],
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
          transcript = await transcribeImageWithTesseract(buffer);
        }

        let structuredEntries: StructuredEntry[] = [];
        if (transcript && transcript !== "EMPTY") {
          const structured = await structureTranscript({
            apiKey: params.apiKey,
            baseUrl: params.baseUrl,
            model: params.model,
            transcript,
            instructions: params.instructions,
            existingEntries: params.existingEntries,
            appendOnly: Boolean(params.existingEntries?.length),
          }).catch(() => ({ entries: [] as StructuredEntry[] }));

          structuredEntries = filterValidEntries(structured.entries ?? []);

          const desiredEntryCount = getDesiredEntryCount(transcript);
          const coveredSentences = countCoveredSentences(structuredEntries);
          const sentenceCount = splitTranscriptSentences(transcript).length;
          if (
            structuredEntries.length < desiredEntryCount ||
            coveredSentences < Math.min(Math.max(sentenceCount - 1, 1), 8)
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
        }

        return {
          cleanedText: transcript,
          entries:
            transcript && transcript !== "EMPTY"
              ? structuredEntries.length > 0
                ? structuredEntries
                : []
              : [],
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

  return {
    rawText: cleanedTexts.join("\n\n").trim(),
    cleanedText: cleanedTexts.join("\n\n").trim(),
    entries: filterValidEntries(entries),
    method,
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
  const directTermMode = String(formData.get("directTermMode") || "") === "1";
  const sourceFileName = String(formData.get("sourceFileName") || "").trim();
  const requestedTermsRaw = String(formData.get("requestedTerms") || "[]");
  const existingEntriesRaw = String(formData.get("existingEntries") || "[]");
  let existingEntries: RecognitionEntry[] = [];
  let requestedTerms: string[] = [];
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

  const apiKey = process.env.ARK_API_KEY;
  const baseUrlFromEnv = process.env.ARK_BASE_URL;
  const modelFromEnv = process.env.ARK_MODEL;

  if (!apiKey || !baseUrlFromEnv || !modelFromEnv) {
    return NextResponse.json(
      {
        error:
          "缺少 Ark 环境变量。请在项目根目录 .env.local 中配置 ARK_API_KEY、ARK_BASE_URL、ARK_MODEL。",
      },
      { status: 500 },
    );
  }

  const baseUrl = normalizeBaseUrlOverride(requestedBaseUrl, baseUrlFromEnv);
  const selectedModelOption =
    normalizeModelOverride(requestedModel) ??
    getArkModelOption(DEFAULT_ARK_MODEL) ??
    normalizeModelOverride(modelFromEnv);

  if (!selectedModelOption) {
    return NextResponse.json(
      {
        error: "当前模型配置不可用，请重新选择一个有效模型后再试。",
      },
      { status: 500 },
    );
  }

  const selectedModel = selectedModelOption.value;
  const apiModel = selectedModelOption.apiModel;
  const visionModelOption = getArkModelOption("doubao-seed-2-0-pro") ?? selectedModelOption;
  const visionModel = visionModelOption.apiModel;

  try {
    let transcript = "";
    let fileName =
      sourceFileName ||
      (directTermMode && requestedTerms.length > 0 ? requestedTerms.join("、") : "继续追加词汇");
    let ocrMethod: OcrMethod = "vision";
    let cleanedText = "";
    let entries: StructuredEntry[] = [];
    let mode: "vision" | "vision-fallback" = "vision";
    let effectiveModelOptionForResponse = selectedModelOption;

    if (directTermMode && requestedTerms.length > 0) {
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
        preferOcrFirst: ocrFirst,
        preferVision,
      });
      transcript = analysis.rawText;
      cleanedText = analysis.rawText;
      entries = filterValidEntries(analysis.entries);
      ocrMethod = analysis.method;
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

    if (!transcript || transcript === "EMPTY") {
      return NextResponse.json(
        {
          error:
            "Doubao 已完成图片识别，但没有读到足够清晰的英文正文。请换一张只包含正文、分辨率更高的英文截图再试。",
        },
        { status: 422 },
      );
    }

    const rawText = transcript;

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

      const mergedRequestedEntries = dedupeLearningEntries([
        ...requestedEntries,
        ...supplementalEntries,
      ]);

      if (mergedRequestedEntries.length > 0) {
        entries = filterValidEntries(mergedRequestedEntries);
        mode = "vision-fallback";
      }
    }

    if (files.length === 0 && entries.length === 0) {
      try {
        const structured = await structureTranscript({
          apiKey,
          baseUrl,
          model: apiModel,
          transcript,
          instructions,
          existingEntries,
          appendOnly: existingEntries.length > 0,
        });
        cleanedText = structured.cleanedText ?? transcript;
        entries = filterValidEntries(structured.entries ?? []);
      } catch {
        if (entries.length === 0) {
          mode = "vision-fallback";
        }
      }

      if (entries.length > 0 || localHeuristic) {
        const desiredEntryCount = getDesiredEntryCount(transcript);
        const coveredSentences = countCoveredSentences(entries);
        const sentenceCount = splitTranscriptSentences(transcript).length;
        if (
          entries.length < desiredEntryCount ||
          coveredSentences < Math.min(Math.max(sentenceCount - 1, 1), 8)
        ) {
          const supplementalEntries = await supplementEntriesFromTranscript({
            apiKey,
            baseUrl,
            model: apiModel,
            transcript,
            existingEntries,
            currentEntries: entries,
            limit: Math.max(desiredEntryCount - entries.length, 10),
          });
          entries = filterValidEntries([...entries, ...supplementalEntries]);
        }
      }
    }

    if (entries.length === 0) {
      const fallbackEntries = createFallbackEntries(transcript);
      entries = filterValidEntries(fallbackEntries);
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

    if (entries.length > 0 && files.length === 0 && !ocrFirst && !localHeuristic) {
      entries = await ensureHighQualityEntries({
        apiKey,
        baseUrl,
        model: apiModel,
        entries,
        allowRepair: true,
        repairLimit: files.length > 0 ? 4 : 6,
      });
    }

    if (entries.length === 0) {
      return NextResponse.json(
        {
          error:
            "Doubao 已读到图片内容，但没有成功提取出可用词汇。建议换更清晰的截图，或减少一张图里的文字密度。",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      fileName,
      rawText,
      cleanedText: cleanedText || rawText,
      entries: normalizeEntries(entries),
      mode,
      effectiveModel: effectiveModelOptionForResponse.value,
      effectiveVisionModel: visionModelOption.value,
      resolvedModelId: effectiveModelOptionForResponse.apiModel,
      resolvedVisionModelId: visionModel,
      ocrMethod,
      feishuLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const normalizedMessage =
      message.includes("aborted due to timeout") || message.includes("The operation was aborted")
        ? directTermMode
          ? "词条生成超时。请重试一次；如果仍失败，请换一个更短的词或短语后再试。"
          : "图片分析超时。请重试一次；如果仍失败，我建议优先切换到 Doubao-Seed-2.0-lite 或 Doubao-Seed-2.0-Code 再试。"
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
