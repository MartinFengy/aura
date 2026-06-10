type EntryLike = {
  sentence: string;
  vocabulary: string;
  chinese: string;
  example: string;
  pronunciation?: string;
};

const LOW_QUALITY_CHINESE_PATTERNS = [
  /^表示已发生的动作或状态$/,
  /^表示正在进行的动作或状态$/,
  /^过程；行动；机制$/,
  /^动作或状态$/,
  /^新闻语境中的常见表达$/,
  /^常见表达$/,
] as const;

const LOW_QUALITY_EXAMPLE_PATTERNS = [
  /^Officials said the group\b/i,
  /^Officials said\b.+became a major concern\b/i,
  /^The report said\b/i,
  /^Experts said\b/i,
  /^.+ played an important role in the latest international discussion\.$/i,
  /^.+ was mentioned repeatedly in the official statement\.$/i,
] as const;

export function normalizeSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeVocabulary(value: string) {
  return value
    .replace(/[“”’']/g, "")
    .replace(/[.,;:!?()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWords(value: string) {
  return value.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

function countWords(value: string) {
  return normalizeVocabulary(value)
    .split(" ")
    .filter(Boolean).length;
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
  const words = tokenizeWords(sentence);
  if (words.length < 3) {
    return true;
  }

  const noiseWordCount = words.filter(isLikelyOcrNoiseWord).length;
  const alphaOnlyCount = words.filter((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word)).length;
  const alphaRatio = alphaOnlyCount / Math.max(words.length, 1);

  return noiseWordCount >= Math.ceil(words.length / 2) || alphaRatio < 0.65;
}

export function isLowQualitySourceSentence(sentence: string) {
  const normalized = normalizeSentence(sentence);
  const words = tokenizeWords(normalized);

  if (!normalized) {
    return true;
  }

  if (words.length < 5) {
    return true;
  }

  if (isLikelyOcrNoiseSentence(normalized)) {
    return true;
  }

  if ((normalized.match(/[;；]/g) ?? []).length >= 2) {
    return true;
  }

  if (/^(?:who|which|that|and|or|but|so|because|after|before)\b/i.test(normalized)) {
    return true;
  }

  return false;
}

export function isPlaceholderChinese(value: string) {
  const normalized = value.trim();
  return (
    normalized.length === 0 ||
    normalized.includes("待补充") ||
    normalized.includes("占位") ||
    normalized.toLowerCase() === "todo"
  );
}

export function isLowQualityChineseMeaning(vocabulary: string, value: string) {
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
    tokenizeWords(normalizedVocabulary).length === normalized.split("；").length
  ) {
    return true;
  }

  return false;
}

export function isLowQualityExample(sentence: string, example: string) {
  const normalizedSentence = normalizeSentence(sentence);
  const normalizedExample = normalizeSentence(example);
  const exampleWords = tokenizeWords(normalizedExample);

  if (!normalizedExample) {
    return true;
  }

  if (normalizedExample === normalizedSentence) {
    return true;
  }

  if (/[一-龥]/.test(normalizedExample)) {
    return true;
  }

  if (LOW_QUALITY_EXAMPLE_PATTERNS.some((pattern) => pattern.test(normalizedExample))) {
    return true;
  }

  if (normalizedExample.includes(";") || normalizedExample.includes("；")) {
    return true;
  }

  if (exampleWords.length < 4) {
    return true;
  }

  if (isLikelyOcrNoiseSentence(normalizedExample)) {
    return true;
  }

  if (!/[.?!]["')\]]?$/.test(normalizedExample)) {
    return true;
  }

  return false;
}

export function sanitizeRecognitionEntry<T extends EntryLike>(entry: T): T {
  const sentence = normalizeSentence(entry.sentence);
  const vocabulary = normalizeVocabulary(entry.vocabulary);
  const chinese = normalizeSentence(entry.chinese);
  const example = normalizeSentence(entry.example);
  const pronunciation = normalizeSentence(entry.pronunciation ?? "");

  return {
    ...entry,
    sentence,
    vocabulary,
    chinese,
    example,
    pronunciation,
  };
}

export function getRecognitionEntryQuality<T extends EntryLike>(entry: T) {
  const normalized = sanitizeRecognitionEntry(entry);

  return {
    invalidChinese: isLowQualityChineseMeaning(normalized.vocabulary, normalized.chinese),
    invalidExample: isLowQualityExample(normalized.sentence, normalized.example),
  };
}

export function sanitizeRecognitionTaskEntries<
  TTask extends { entries: TEntry[] },
  TEntry extends EntryLike,
>(task: TTask): TTask {
  return {
    ...task,
    entries: task.entries.map((entry) => sanitizeRecognitionEntry(entry)),
  };
}
