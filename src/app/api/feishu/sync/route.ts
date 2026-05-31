import { NextResponse } from "next/server";
import type { RecognitionEntry } from "@/lib/learning-store";
import { syncRecordsToFeishu } from "@/lib/feishu";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      link?: string;
      taskName?: string;
      entries?: RecognitionEntry[];
    };

    if (!payload.link) {
      return NextResponse.json({ error: "缺少飞书链接。" }, { status: 400 });
    }

    if (!payload.entries || payload.entries.length === 0) {
      return NextResponse.json({ error: "当前任务没有可同步的词条。" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const records = payload.entries.map((entry) => ({
      完整句子: entry.sentence,
      "单词/短语": entry.vocabulary,
      中文意思: entry.chinese,
      例句: entry.example,
      发音: `${origin}/pronounce?text=${encodeURIComponent(entry.vocabulary)}&label=${encodeURIComponent(entry.vocabulary)}`,
    }));

    const result = await syncRecordsToFeishu({
      link: payload.link,
      records,
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      tableId: result.tableId,
      taskName: payload.taskName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const permissionUrl = message.match(/https:\/\/\S+/)?.[0];
    return NextResponse.json(
      {
        error: `飞书同步失败：${message}`,
        permissionUrl,
      },
      { status: 500 },
    );
  }
}
