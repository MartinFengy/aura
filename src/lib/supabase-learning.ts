import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DictationSession,
  RecognitionTask,
} from "@/lib/learning-store";

type LearningTaskRow = {
  user_id: string;
  id: string;
  name: string;
  source: string;
  created_label: string;
  raw_text: null | string;
  feishu_link: null | string;
  entries: RecognitionTask["entries"];
  updated_at?: string;
};

type DictationSessionRow = {
  user_id: string;
  id: string;
  created_at?: string;
  created_label: string;
  task_ids: string[];
  task_names: string[];
  total_questions: number;
  repeat_count: number;
  mode: DictationSession["mode"];
  correct_count: number;
  fuzzy_count: number;
  wrong_count: number;
  answers: DictationSession["answers"];
};

function toTaskRow(userId: string, task: RecognitionTask): LearningTaskRow {
  return {
    user_id: userId,
    id: task.id,
    name: task.name,
    source: task.source,
    created_label: task.createdAt,
    raw_text: task.rawText ?? null,
    feishu_link: task.feishuLink ?? null,
    entries: task.entries,
  };
}

function fromTaskRow(row: LearningTaskRow): RecognitionTask {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    createdAt: row.created_label,
    rawText: row.raw_text ?? "",
    feishuLink: row.feishu_link ?? undefined,
    entries: Array.isArray(row.entries) ? row.entries : [],
  };
}

function toSessionRow(userId: string, session: DictationSession): DictationSessionRow {
  return {
    user_id: userId,
    id: session.id,
    created_label: session.createdAt,
    task_ids: session.taskIds,
    task_names: session.taskNames,
    total_questions: session.totalQuestions,
    repeat_count: session.repeatCount,
    mode: session.mode,
    correct_count: session.correctCount,
    fuzzy_count: session.fuzzyCount,
    wrong_count: session.wrongCount,
    answers: session.answers,
  };
}

function fromSessionRow(row: DictationSessionRow): DictationSession {
  return {
    id: row.id,
    createdAt: row.created_label,
    taskIds: Array.isArray(row.task_ids) ? row.task_ids : [],
    taskNames: Array.isArray(row.task_names) ? row.task_names : [],
    totalQuestions: row.total_questions,
    repeatCount: row.repeat_count,
    mode: row.mode,
    correctCount: row.correct_count,
    fuzzyCount: row.fuzzy_count,
    wrongCount: row.wrong_count,
    answers: Array.isArray(row.answers) ? row.answers : [],
  };
}

export async function fetchCloudLearningData(
  client: SupabaseClient,
  userId: string,
) {
  const [tasksResult, historyResult] = await Promise.all([
    client
      .from("learning_tasks")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    client
      .from("dictation_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (tasksResult.error) {
    throw tasksResult.error;
  }

  if (historyResult.error) {
    throw historyResult.error;
  }

  return {
    tasks: (tasksResult.data ?? []).map((row) => fromTaskRow(row as LearningTaskRow)),
    practiceHistory: (historyResult.data ?? []).map((row) =>
      fromSessionRow(row as DictationSessionRow),
    ),
  };
}

export async function upsertTaskToCloud(
  client: SupabaseClient,
  userId: string,
  task: RecognitionTask,
) {
  const { error } = await client
    .from("learning_tasks")
    .upsert(toTaskRow(userId, task), { onConflict: "user_id,id" });

  if (error) {
    throw error;
  }
}

export async function deleteTaskFromCloud(
  client: SupabaseClient,
  userId: string,
  taskId: string,
) {
  const { error } = await client
    .from("learning_tasks")
    .delete()
    .eq("user_id", userId)
    .eq("id", taskId);

  if (error) {
    throw error;
  }
}

export async function upsertDictationSessionToCloud(
  client: SupabaseClient,
  userId: string,
  session: DictationSession,
) {
  const { error } = await client
    .from("dictation_sessions")
    .upsert(toSessionRow(userId, session), { onConflict: "user_id,id" });

  if (error) {
    throw error;
  }
}

export async function deleteDictationSessionFromCloud(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { error } = await client
    .from("dictation_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (error) {
    throw error;
  }
}

