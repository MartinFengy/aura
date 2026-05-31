import { NextResponse } from "next/server";
import type { RecognitionEntry } from "@/lib/learning-store";
import { DEFAULT_FEISHU_LINK } from "@/lib/aura-config";

export const runtime = "nodejs";

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

function normalizeVocabulary(value: string) {
  return value.replace(/[“”"'.,;:!?()]+/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(value: string) {
  return normalizeVocabulary(value)
    .split(" ")
    .filter(Boolean).length;
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

function isValidLearningEntry(sentence: string, entry: StructuredEntry) {
  const normalizedSentence = normalizeSentence(sentence);
  const normalizedEntrySentence = normalizeSentence(entry.sentence);
  const vocabulary = normalizeVocabulary(entry.vocabulary);
  const lowerSentence = normalizedSentence.toLowerCase();
  const lowerVocabulary = vocabulary.toLowerCase();
  const wordCount = countWords(vocabulary);
  const firstTwoWords = normalizeSentence(sentence)
    .split(" ")
    .slice(0, 2)
    .join(" ")
    .toLowerCase();

  if (!normalizedEntrySentence || normalizedEntrySentence !== normalizedSentence) {
    return false;
  }

  if (!vocabulary || !lowerSentence.includes(lowerVocabulary)) {
    return false;
  }

  if (wordCount > 5) {
    return false;
  }

  if (isPlaceholderChinese(entry.chinese)) {
    return false;
  }

  if (!entry.example.trim() || normalizeSentence(entry.example) === normalizedSentence) {
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

  return true;
}

function pickVocabulary(sentence: string) {
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

function createFallbackEntries(transcript: string) {
  const sentences = Array.from(new Set(splitTranscriptSentences(transcript)));

  return sentences.map((sentence, index) => {
    const vocabulary = pickVocabulary(sentence);
    return {
      id: `entry-${Date.now()}-fallback-${index}`,
      sentence,
      vocabulary,
      chinese: "待补充释义",
      example: sentence,
      pronunciation: `${vocabulary}. ${sentence}`,
    };
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

function filterValidEntries(entries: StructuredEntry[]) {
  return dedupeLearningEntries(
    entries.filter((entry) => isValidLearningEntry(entry.sentence, entry)),
  );
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
    signal: AbortSignal.timeout(params.timeoutMs ?? 30000),
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

function cleanTranscript(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, ""))
    .replace(/^TRANSCRIPT\s*:/im, "")
    .trim();
}

async function transcribeImageWithModel(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  buffer: Buffer;
  fileType: string;
}) {
  const base64 = params.buffer.toString("base64");
  const imageUrl = `data:${params.fileType || "image/png"};base64,${base64}`;

  const content = await callArkContent({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 30000,
    messages: [
      {
        role: "system",
        content:
          "You are an accurate English text transcriber. Return only visible useful English text from the image.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
Read the image and transcribe only the meaningful English learning content.

Rules:
1. Output only useful visible English text from the image.
2. Ignore icons, logos, timestamps, decorative UI, page chrome, watermarks, and garbage fragments.
3. Keep complete sentences when possible.
4. Preserve line breaks between paragraphs or sentences.
5. If there is no readable English text, reply exactly with EMPTY.
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

  return cleanTranscript(content);
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
    timeoutMs: 20000,
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
3. vocabulary must be one advanced word or phrase above high-school English level from that sentence.
4. chinese must be concise Chinese meaning.
5. example must be one new natural English example sentence.
6. pronunciation must be a short TTS-friendly English text for reading aloud.
7. Extract as many qualified words and phrases as possible across every sentence. Return 12 to 36 entries when possible.
8. If appendOnly is true, only return NEW entries that do not duplicate the existing list.
9. Keep the result accurate and do not invent original sentences.
10. It is allowed and encouraged to extract high-quality proper nouns and named entities when they are educationally valuable, such as person names, place names, institutions, official titles, products, treaties, and geopolitical regions.
11. Prefer multiple items from the same sentence when the sentence truly contains several strong candidates.
12. If the user explicitly requests certain words or phrases, prioritize those requested items first, then supplement with other strong candidates from the same sentence.

Text:
${params.transcript}

appendOnly:
${params.appendOnly ? "true" : "false"}

User instructions:
${params.instructions || "请提取每句话中高于高中英语水平的单词和短语。"}

Existing entries to avoid duplicating:
${existingVocabulary || "none"}
        `.trim(),
      },
    ],
  });
}

async function extractEntriesForSentence(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  sentence: string;
  previousInvalidVocabulary?: string[];
}) {
  const invalidHint = params.previousInvalidVocabulary?.length
    ? `Do not choose any of these again: ${params.previousInvalidVocabulary.join(", ")}.`
    : "";

  const payload = await callArkJson({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    timeoutMs: 20000,
    messages: [
      {
        role: "system",
        content: "You are an experienced English teacher creating one precise vocabulary note.",
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

Sentence:
${params.sentence}

Rules:
1. sentence must exactly equal the sentence above.
2. Return 1 to 5 entries from the sentence. Prefer as many high-quality items as truly exist.
3. High-quality proper nouns and named entities are allowed and encouraged when they are educationally meaningful: person names, place names, institutions, official titles, products, organizations, geopolitical regions, treaties, and well-known events.
4. The vocabulary must be a real advanced word, proper noun, or fixed phrase from the sentence, not an arbitrary leading fragment.
5. chinese must be a concise and accurate Chinese meaning.
6. example must be a new natural English example sentence, not a copy of the original.
7. pronunciation should be short TTS-friendly readable English text.
8. Prefer items such as backlash, amid, testify, wrongdoing, superintendent, expiring tax breaks, gather information, nuclear negotiations, surrounding demonstrations, largest EV maker, President Donald Trump, Middle East, Marco Rubio, Southern Transitional Council, Iran, Yemen, Rubio, Trump.
9. If the sentence only contains one strong item, return only one.
10. Avoid trivial fragments, isolated determiners, plain time expressions, and meaningless first-two-word chunks.
${invalidHint}
        `.trim(),
      },
    ],
  });

  return (payload as { entries?: StructuredEntry[] }).entries ?? [];
}

async function buildEntriesSentenceBySentence(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcript: string;
}) {
  const sentences = Array.from(new Set(splitTranscriptSentences(params.transcript)));
  const entries: StructuredEntry[] = [];

  for (const sentence of sentences) {
    let rejectedVocabulary: string[] = [];
    const acceptedVocabulary = new Set<string>();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const nextEntries = await extractEntriesForSentence({
          apiKey: params.apiKey,
          baseUrl: params.baseUrl,
          model: params.model,
          sentence,
          previousInvalidVocabulary: [...rejectedVocabulary, ...acceptedVocabulary],
        });

        const validEntries = nextEntries.filter((entry) =>
          isValidLearningEntry(sentence, entry),
        );

        const uniqueEntries = validEntries.filter(
          (entry, index, current) =>
            current.findIndex(
              (candidate) =>
                normalizeVocabulary(candidate.vocabulary).toLowerCase() ===
                normalizeVocabulary(entry.vocabulary).toLowerCase(),
            ) === index,
        );

        const freshEntries = uniqueEntries.filter((entry) => {
          const key = normalizeVocabulary(entry.vocabulary).toLowerCase();
          return !acceptedVocabulary.has(key);
        });

        if (freshEntries.length > 0) {
          freshEntries.forEach((entry) => {
            acceptedVocabulary.add(normalizeVocabulary(entry.vocabulary).toLowerCase());
            entries.push(entry);
          });

          if (freshEntries.length >= 2 || acceptedVocabulary.size >= 3) {
            break;
          }
        }
        rejectedVocabulary = [
          ...rejectedVocabulary,
          ...nextEntries.map((entry) => entry.vocabulary),
        ];
      } catch {
        // Retry with stricter invalid hint.
      }
    }
  }

  return entries;
}

async function transcribeFiles(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  files: File[];
}) {
  const transcripts = await Promise.all(
    params.files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      return transcribeImageWithModel({
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        model: params.model,
        buffer,
        fileType: file.type,
      });
    }),
  );

  return transcripts
    .map((item) => item.trim())
    .filter((item) => item && item !== "EMPTY")
    .join("\n\n");
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
  const existingEntriesRaw = String(formData.get("existingEntries") || "[]");
  let existingEntries: RecognitionEntry[] = [];
  try {
    existingEntries = JSON.parse(existingEntriesRaw) as RecognitionEntry[];
  } catch {
    existingEntries = [];
  }

  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL;

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json(
      {
        error:
          "缺少 Ark 环境变量。请在项目根目录 .env.local 中配置 ARK_API_KEY、ARK_BASE_URL、ARK_MODEL。",
      },
      { status: 500 },
    );
  }

  try {
    const visionModel = process.env.ARK_VISION_MODEL || model;
    let transcript = "";
    let fileName = "继续追加词汇";

    if (files.length > 0) {
      transcript = await transcribeFiles({
        apiKey,
        baseUrl,
        model: visionModel,
        files,
      });
      fileName =
        files.length === 1
          ? files[0]?.name ?? "图片识别结果"
          : `${files[0]?.name ?? "多图"} 等 ${files.length} 个文件`;
    } else if (existingRawText) {
      transcript = existingRawText;
    } else {
      return NextResponse.json({ error: "请先上传图片或选择已有任务继续追加。" }, { status: 400 });
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
    let cleanedText = transcript;
    let entries: StructuredEntry[] = [];
    let mode: "vision" | "vision-fallback" = "vision";
    try {
      const structured = await structureTranscript({
        apiKey,
        baseUrl,
        model,
        transcript,
        instructions,
        existingEntries,
        appendOnly: files.length === 0 && existingEntries.length > 0,
      });
      cleanedText = structured.cleanedText ?? transcript;
      entries = filterValidEntries(structured.entries ?? []);
    } catch {
      mode = "vision-fallback";
    }

    try {
      const rescuedEntries = filterValidEntries(
        await buildEntriesSentenceBySentence({
          apiKey,
          baseUrl,
          model,
          transcript,
        }),
      );
      const rescuedSentenceCount = new Set(
        rescuedEntries.map((entry) => normalizeSentence(entry.sentence)),
      ).size;
      const mergedEntries = dedupeLearningEntries([...entries, ...rescuedEntries]);

      if (
        rescuedEntries.length > entries.length ||
        rescuedSentenceCount > new Set(entries.map((entry) => normalizeSentence(entry.sentence))).size
      ) {
        entries = mergedEntries;
        mode = "vision";
      }
    } catch {
      if (entries.length === 0) {
        mode = "vision-fallback";
      }
    }

    if (entries.length === 0) {
      entries = filterValidEntries(createFallbackEntries(transcript));
      mode = "vision-fallback";
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
      feishuLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { error: `图片分析失败：${message}` },
      { status: 500 },
    );
  }
}
