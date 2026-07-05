"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createTaskFromAnalysis,
  createTaskFromUpload,
  getActiveUserKey,
  getDictationHistoryStorageKey,
  getTasksStorageKey,
  normalizeUserKey,
  setActiveUserKey,
  type DictationSession,
  initialRecognitionTasks,
  type RecognitionTask,
} from "@/lib/learning-store";
import { sanitizeRecognitionTaskEntries } from "@/lib/recognition-quality";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import {
  deleteDictationSessionFromCloud,
  deleteTaskFromCloud,
  fetchCloudLearningData,
  upsertDictationSessionToCloud,
  upsertTaskToCloud,
} from "@/lib/supabase-learning";

type LearningOverview = {
  totalVocabulary: number;
  mastered: number;
  fuzzy: number;
  wrong: number;
  audioSegments: number;
  recognizedTasks: number;
};

type LearningTasksContextValue = {
  tasks: RecognitionTask[];
  selectedTask: null | RecognitionTask;
  selectedTaskId: string;
  practiceHistory: DictationSession[];
  learningOverview: LearningOverview;
  setSelectedTaskId: (taskId: string) => void;
  addTaskFromFile: (fileName: string) => RecognitionTask;
  addTaskFromAnalysis: (task: RecognitionTask) => RecognitionTask;
  replaceTaskEntries: (params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    properNouns?: RecognitionTask["properNouns"];
    keepCurrentSelection?: boolean;
  }) => void;
  appendAnalysisToTask: (params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    properNouns?: RecognitionTask["properNouns"];
    feishuLink?: string;
  }) => {
    task: RecognitionTask;
    appendedCount: number;
    updatedCount: number;
  } | null;
  renameTask: (taskId: string, name: string) => void;
  deleteTask: (taskId: string) => void;
  deleteEntry: (params: { taskId: string; entryId: string }) => void;
  deleteDictationSession: (sessionId: string) => void;
  recordDictationSession: (
    session: Omit<DictationSession, "id" | "createdAt">,
  ) => DictationSession;
};

const LearningTasksContext = createContext<null | LearningTasksContextValue>(null);

function readStoredTasks(userKey: string) {
  if (typeof window === "undefined") {
    return initialRecognitionTasks;
  }

  try {
    const stored = window.localStorage.getItem(getTasksStorageKey(userKey));
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as RecognitionTask[];
    return parsed.length > 0 ? parsed.map((task) => sanitizeRecognitionTaskEntries(task)) : [];
  } catch {
    return [];
  }
}

function readStoredHistory(userKey: string) {
  if (typeof window === "undefined") {
    return [] as DictationSession[];
  }

  try {
    const stored = window.localStorage.getItem(
      getDictationHistoryStorageKey(userKey),
    );
    if (!stored) {
      return [] as DictationSession[];
    }

    const parsed = JSON.parse(stored) as DictationSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as DictationSession[];
  }
}

function writeStoredTasks(userKey: string, tasks: RecognitionTask[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getTasksStorageKey(userKey),
    JSON.stringify(tasks),
  );
}

function filterTaskPendingDeletedEntries(
  task: RecognitionTask,
  pendingDeletedEntryIdsByTask?: Map<string, Set<string>>,
) {
  const pendingDeletedEntryIds = pendingDeletedEntryIdsByTask?.get(task.id);
  if (!pendingDeletedEntryIds || pendingDeletedEntryIds.size === 0) {
    return task;
  }

  return {
    ...task,
    entries: task.entries.filter((entry) => !pendingDeletedEntryIds.has(entry.id)),
    properNouns: (task.properNouns ?? []).filter((entry) => !pendingDeletedEntryIds.has(entry.id)),
  };
}

function mergeTasks(
  localTasks: RecognitionTask[],
  cloudTasks: RecognitionTask[],
  pendingDeletedEntryIdsByTask?: Map<string, Set<string>>,
) {
  const merged = new Map<string, RecognitionTask>();

  for (const task of cloudTasks) {
    const localTaskSource = localTasks.find((candidate) => candidate.id === task.id);
    const localTask = localTaskSource
      ? filterTaskPendingDeletedEntries(localTaskSource, pendingDeletedEntryIdsByTask)
      : undefined;
    const pendingDeletedEntries = pendingDeletedEntryIdsByTask?.get(task.id) ?? new Set<string>();
    const cloudEntries = (task.entries ?? []).filter((entry) => !pendingDeletedEntries.has(entry.id));
    const localEntries = (localTask?.entries ?? []).filter(
      (entry) => !pendingDeletedEntries.has(entry.id),
    );
    const cloudProperNouns = (task.properNouns ?? []).filter(
      (entry) => !pendingDeletedEntries.has(entry.id),
    );
    const localProperNouns = (localTask?.properNouns ?? []).filter(
      (entry) => !pendingDeletedEntries.has(entry.id),
    );
    const resolvedEntries = localTask ? localEntries : cloudEntries;
    const resolvedProperNouns = localTask ? localProperNouns : cloudProperNouns;
    merged.set(
      task.id,
      sanitizeRecognitionTaskEntries({
        ...task,
        ...(localTask
          ? {
              name: localTask.name,
              source: localTask.source,
              createdAt: localTask.createdAt,
              feishuLink: localTask.feishuLink ?? task.feishuLink,
            }
          : {}),
        rawText:
          (localTask?.rawText?.length ?? 0) > (task.rawText?.length ?? 0)
            ? localTask?.rawText ?? ""
            : task.rawText || localTask?.rawText || "",
        entries: resolvedEntries,
        properNouns: resolvedProperNouns,
      }),
    );
  }

  for (const task of localTasks) {
    if (!merged.has(task.id)) {
      merged.set(
        task.id,
        sanitizeRecognitionTaskEntries(
          filterTaskPendingDeletedEntries(task, pendingDeletedEntryIdsByTask),
        ),
      );
    }
  }

  return Array.from(merged.values());
}

function mergeHistory(
  localHistory: DictationSession[],
  cloudHistory: DictationSession[],
) {
  const merged = new Map<string, DictationSession>();

  for (const session of cloudHistory) {
    merged.set(session.id, session);
  }

  for (const session of localHistory) {
    if (!merged.has(session.id)) {
      merged.set(session.id, session);
    }
  }

  return Array.from(merged.values());
}

function sameTaskShape(left: RecognitionTask[], right: RecognitionTask[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftKeys = left
    .map((task) => `${task.id}:${task.entries.length}:${task.properNouns?.length ?? 0}:${task.name}`)
    .sort();
  const rightKeys = right
    .map((task) => `${task.id}:${task.entries.length}:${task.properNouns?.length ?? 0}:${task.name}`)
    .sort();

  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function sameHistoryShape(left: DictationSession[], right: DictationSession[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftKeys = left
    .map((session) => `${session.id}:${session.answers.length}:${session.createdAt}`)
    .sort();
  const rightKeys = right
    .map((session) => `${session.id}:${session.answers.length}:${session.createdAt}`)
    .sort();

  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function resolveNextSelectedTaskId(
  previousSelectedTaskId: string,
  nextTasks: RecognitionTask[],
) {
  if (previousSelectedTaskId && nextTasks.some((task) => task.id === previousSelectedTaskId)) {
    return previousSelectedTaskId;
  }

  return nextTasks[0]?.id ?? "";
}

export function LearningTasksProvider({ children }: { children: ReactNode }) {
  const [activeUserKey, setActiveUserKeyState] = useState("guest");
  const [cloudUserId, setCloudUserId] = useState<null | string>(null);
  const [tasks, setTasks] = useState<RecognitionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [practiceHistory, setPracticeHistory] = useState<DictationSession[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const tasksRef = useRef<RecognitionTask[]>([]);
  const pendingDeletedTaskIdsRef = useRef<Set<string>>(new Set());
  const pendingDeletedEntryIdsRef = useRef<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const browserClient = getSupabaseBrowserClient();
    const syncUser = async () => {
      const nextActiveUserKey = getActiveUserKey();
      setActiveUserKeyState(nextActiveUserKey);

      if (!browserClient || !hasSupabaseEnv()) {
        setCloudUserId(null);
        return;
      }

      const {
        data: { user },
      } = await browserClient.auth.getUser();

      setCloudUserId(user?.id ?? null);

      if (user?.email) {
        const normalizedEmail = normalizeUserKey(user.email);
        setActiveUserKeyState(normalizedEmail);
        if (normalizedEmail !== nextActiveUserKey) {
          setActiveUserKey(user.email);
        }
      }
    };

    void syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener("aura-active-user-change", syncUser as EventListener);

    const authSubscription = browserClient?.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setCloudUserId(user?.id ?? null);

      if (user?.email) {
        setActiveUserKeyState(normalizeUserKey(user.email));
        setActiveUserKey(user.email);
      } else {
        setActiveUserKeyState(getActiveUserKey());
      }
    });

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(
        "aura-active-user-change",
        syncUser as EventListener,
      );
      authSubscription?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateData() {
      const nextTasks = readStoredTasks(activeUserKey)
        .filter((task) => !pendingDeletedTaskIdsRef.current.has(task.id))
        .map((task) => filterTaskPendingDeletedEntries(task, pendingDeletedEntryIdsRef.current));
      const nextHistory = readStoredHistory(activeUserKey);
      const browserClient = getSupabaseBrowserClient();

      if (!cloudUserId || !browserClient || !hasSupabaseEnv()) {
        if (cancelled) {
          return;
        }

        tasksRef.current = nextTasks;
        setTasks(nextTasks);
        setPracticeHistory(nextHistory);
        setSelectedTaskId((current) => resolveNextSelectedTaskId(current, nextTasks));
        setHydrated(true);
        return;
      }

      try {
        const cloudData = await fetchCloudLearningData(browserClient, cloudUserId);
        const cloudTasks = cloudData.tasks.filter(
          (task) => !pendingDeletedTaskIdsRef.current.has(task.id),
        );
        const mergedTasks = mergeTasks(nextTasks, cloudTasks, pendingDeletedEntryIdsRef.current);
        const mergedHistory = mergeHistory(nextHistory, cloudData.practiceHistory);

        const needsTaskMigration =
          cloudTasks.length === 0 && mergedTasks.length > 0;
        const needsHistoryMigration =
          cloudData.practiceHistory.length === 0 && mergedHistory.length > 0;

        if (needsTaskMigration) {
          await Promise.all(
            mergedTasks.map((task) => upsertTaskToCloud(browserClient, cloudUserId, task)),
          );
        }

        if (needsHistoryMigration) {
          await Promise.all(
            mergedHistory.map((session) =>
              upsertDictationSessionToCloud(browserClient, cloudUserId, session),
            ),
          );
        }

        if (cancelled) {
          return;
        }

        const resolvedTasks = mergedTasks;
        const resolvedHistory = mergedHistory;

        tasksRef.current = resolvedTasks;
        setTasks(resolvedTasks);
        setPracticeHistory(resolvedHistory);
        setSelectedTaskId((current) => resolveNextSelectedTaskId(current, resolvedTasks));
        setHydrated(true);

        if (!sameTaskShape(nextTasks, resolvedTasks)) {
          window.localStorage.setItem(
            getTasksStorageKey(activeUserKey),
            JSON.stringify(resolvedTasks),
          );
        }

        if (!sameHistoryShape(nextHistory, resolvedHistory)) {
          window.localStorage.setItem(
            getDictationHistoryStorageKey(activeUserKey),
            JSON.stringify(resolvedHistory),
          );
        }
      } catch (error) {
        console.error("Failed to hydrate cloud learning data", error);
        if (cancelled) {
          return;
        }

        tasksRef.current = nextTasks;
        setTasks(nextTasks);
        setPracticeHistory(nextHistory);
        setSelectedTaskId((current) => resolveNextSelectedTaskId(current, nextTasks));
        setHydrated(true);
      }
    }

    void hydrateData();

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void hydrateData();
      }
    };

    const handleFocusRefresh = () => {
      void hydrateData();
    };

    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [activeUserKey, cloudUserId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getTasksStorageKey(activeUserKey),
      JSON.stringify(tasks),
    );
  }, [activeUserKey, tasks, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getDictationHistoryStorageKey(activeUserKey),
      JSON.stringify(practiceHistory),
    );
  }, [activeUserKey, hydrated, practiceHistory]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null,
    [tasks, selectedTaskId],
  );

  const learningOverview = useMemo<LearningOverview>(() => {
    const uniqueEntries = new Map<
      string,
      { taskId: string; entryId: string; vocabulary: string }
    >();

    tasks.forEach((task) => {
      task.entries.forEach((entry) => {
        uniqueEntries.set(`${entry.sentence}__${entry.vocabulary}`, {
          taskId: task.id,
          entryId: entry.id,
          vocabulary: entry.vocabulary,
        });
      });
    });

    const progress = new Map<
      string,
      { correct: number; fuzzy: number; wrong: number }
    >();

    practiceHistory.forEach((session) => {
      session.answers.forEach((answer) => {
        const key = `${answer.entryId}__${answer.taskId}`;
        const current = progress.get(key) ?? { correct: 0, fuzzy: 0, wrong: 0 };

        if (answer.result === "认识") {
          current.correct += 1;
        } else if (answer.result === "模糊") {
          current.fuzzy += 1;
        } else {
          current.wrong += 1;
        }

        progress.set(key, current);
      });
    });

    let mastered = 0;
    let fuzzy = 0;
    let wrong = 0;

    uniqueEntries.forEach((entry) => {
      const stats = progress.get(`${entry.entryId}__${entry.taskId}`);
      if (!stats) {
        return;
      }

      if (stats.wrong > 0 && stats.wrong >= stats.correct) {
        wrong += 1;
      } else if (stats.correct > stats.fuzzy + stats.wrong) {
        mastered += 1;
      } else {
        fuzzy += 1;
      }
    });

    return {
      totalVocabulary: uniqueEntries.size,
      mastered,
      fuzzy,
      wrong,
      audioSegments: uniqueEntries.size * 3,
      recognizedTasks: tasks.length,
    };
  }, [practiceHistory, tasks]);

  function addTaskFromFile(fileName: string) {
    const task = createTaskFromUpload(fileName);
    const nextTasks = [task, ...tasksRef.current];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    setSelectedTaskId(task.id);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId) {
      void upsertTaskToCloud(browserClient, cloudUserId, task).catch((error) => {
        console.error("Failed to create task in cloud", error);
      });
    }
    return task;
  }

  function addTaskFromAnalysis(task: RecognitionTask) {
    const sanitizedTask = sanitizeRecognitionTaskEntries(task);
    const nextTasks = [sanitizedTask, ...tasksRef.current];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    setSelectedTaskId(sanitizedTask.id);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId) {
      void upsertTaskToCloud(browserClient, cloudUserId, sanitizedTask).catch((error) => {
        console.error("Failed to sync task to cloud", error);
      });
    }
    return sanitizedTask;
  }

  function appendAnalysisToTask(params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    properNouns?: RecognitionTask["properNouns"];
    feishuLink?: string;
  }) {
    const currentTask = tasksRef.current.find((task) => task.id === params.taskId) ?? null;
    if (!currentTask) {
      return null;
    }

    let appendedCount = 0;
    let updatedCount = 0;

    const incomingLearningEntries = params.entries ?? [];
    const currentLearningEntries = [...currentTask.entries];
    const learningEntryIndex = new Map(
      currentLearningEntries.map((entry, index) => [
        `${entry.sentence}__${entry.vocabulary}`,
        index,
      ]),
    );

    for (const entry of incomingLearningEntries) {
      const key = `${entry.sentence}__${entry.vocabulary}`;
      const existingIndex = learningEntryIndex.get(key);
      if (existingIndex === undefined) {
        learningEntryIndex.set(key, currentLearningEntries.length);
        currentLearningEntries.push(entry);
        appendedCount += 1;
        continue;
      }

      currentLearningEntries[existingIndex] = {
        ...currentLearningEntries[existingIndex],
        ...entry,
      };
      updatedCount += 1;
    }

    const incomingProperNouns = (params.properNouns ?? []) as RecognitionTask["entries"];
    const currentProperNouns = [...(currentTask.properNouns ?? [])];
    const properNounIndex = new Map(
      currentProperNouns.map((entry, index) => [
        `${entry.sentence}__${entry.vocabulary}`,
        index,
      ]),
    );

    for (const entry of incomingProperNouns) {
      const key = `${entry.sentence}__${entry.vocabulary}`;
      const existingIndex = properNounIndex.get(key);
      if (existingIndex === undefined) {
        properNounIndex.set(key, currentProperNouns.length);
        currentProperNouns.push(entry);
        appendedCount += 1;
        continue;
      }

      currentProperNouns[existingIndex] = {
        ...currentProperNouns[existingIndex],
        ...entry,
      };
      updatedCount += 1;
    }

    const nextTask = sanitizeRecognitionTaskEntries({
      ...currentTask,
      rawText: [currentTask.rawText, params.rawText].filter(Boolean).join("\n\n"),
      feishuLink: params.feishuLink ?? currentTask.feishuLink,
      entries: currentLearningEntries,
      properNouns: currentProperNouns,
    });

    const nextTasks = tasksRef.current.map((task) =>
      task.id === params.taskId ? nextTask : task,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    setSelectedTaskId(params.taskId);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask).catch((error) => {
        console.error("Failed to append task analysis to cloud", error);
      });
    }

    return {
      task: nextTask,
      appendedCount,
      updatedCount,
    };
  }

  function replaceTaskEntries(params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    properNouns?: RecognitionTask["properNouns"];
    keepCurrentSelection?: boolean;
  }) {
    const currentTask = tasksRef.current.find((task) => task.id === params.taskId) ?? null;
    if (!currentTask) {
      return;
    }

    const nextTask = sanitizeRecognitionTaskEntries({
      ...currentTask,
      rawText: params.rawText ?? currentTask.rawText,
      entries: params.entries,
      properNouns: params.properNouns ?? currentTask.properNouns ?? [],
    });
    const nextTasks = tasksRef.current.map((task) =>
      task.id === params.taskId ? nextTask : task,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    if (!params.keepCurrentSelection) {
      setSelectedTaskId(params.taskId);
    }
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask).catch((error) => {
        console.error("Failed to replace task entries in cloud", error);
      });
    }
  }

  function renameTask(taskId: string, name: string) {
    const currentTask = tasksRef.current.find((task) => task.id === taskId) ?? null;
    if (!currentTask) {
      return;
    }

    const nextTask = { ...currentTask, name };
    const nextTasks = tasksRef.current.map((task) =>
      task.id === taskId ? nextTask : task,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask).catch((error) => {
        console.error("Failed to rename task in cloud", error);
      });
    }
  }

  function deleteTask(taskId: string) {
    pendingDeletedTaskIdsRef.current.add(taskId);
    const nextTasks = tasksRef.current.filter((task) => task.id !== taskId);
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    setSelectedTaskId((selected) =>
      selected === taskId ? nextTasks[0]?.id ?? "" : selected,
    );
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId) {
      void deleteTaskFromCloud(browserClient, cloudUserId, taskId)
        .catch((error) => {
          pendingDeletedTaskIdsRef.current.delete(taskId);
          console.error("Failed to delete task from cloud", error);
        });
      return;
    }
    pendingDeletedTaskIdsRef.current.delete(taskId);
  }

  function deleteEntry(params: { taskId: string; entryId: string }) {
    const existingPendingEntryIds =
      pendingDeletedEntryIdsRef.current.get(params.taskId) ?? new Set<string>();
    pendingDeletedEntryIdsRef.current.set(
      params.taskId,
      new Set([...existingPendingEntryIds, params.entryId]),
    );
    const currentTask = tasksRef.current.find((task) => task.id === params.taskId) ?? null;
    if (!currentTask) {
      return;
    }

    const nextTask: RecognitionTask = {
      ...currentTask,
      entries: currentTask.entries.filter((entry) => entry.id !== params.entryId),
      properNouns: (currentTask.properNouns ?? []).filter(
        (entry) => entry.id !== params.entryId,
      ),
    };
    const nextTasks = tasksRef.current.map((task) =>
      task.id === params.taskId ? nextTask : task,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    writeStoredTasks(activeUserKey, nextTasks);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask)
        .catch((error) => {
          const pendingEntryIds = pendingDeletedEntryIdsRef.current.get(params.taskId);
          if (pendingEntryIds) {
            pendingEntryIds.delete(params.entryId);
            if (pendingEntryIds.size === 0) {
              pendingDeletedEntryIdsRef.current.delete(params.taskId);
            }
          }
          console.error("Failed to delete entry from cloud task", error);
        });
      return;
    }
    const pendingEntryIds = pendingDeletedEntryIdsRef.current.get(params.taskId);
    if (pendingEntryIds) {
      pendingEntryIds.delete(params.entryId);
      if (pendingEntryIds.size === 0) {
        pendingDeletedEntryIdsRef.current.delete(params.taskId);
      }
    }
  }

  function recordDictationSession(session: Omit<DictationSession, "id" | "createdAt">) {
    const nextSession: DictationSession = {
      ...session,
      id: `dictation-${Date.now()}`,
      createdAt: new Date().toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setPracticeHistory((current) => [nextSession, ...current].slice(0, 60));
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId) {
      void upsertDictationSessionToCloud(browserClient, cloudUserId, nextSession).catch(
        (error) => {
          console.error("Failed to record dictation session in cloud", error);
        },
      );
    }
    return nextSession;
  }

  function deleteDictationSession(sessionId: string) {
    setPracticeHistory((current) =>
      current.filter((session) => session.id !== sessionId),
    );
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId) {
      void deleteDictationSessionFromCloud(browserClient, cloudUserId, sessionId).catch(
        (error) => {
          console.error("Failed to delete dictation session from cloud", error);
        },
      );
    }
  }

  return (
    <LearningTasksContext.Provider
      value={{
        tasks,
        selectedTask,
        selectedTaskId,
        practiceHistory,
        learningOverview,
        setSelectedTaskId,
        addTaskFromFile,
        addTaskFromAnalysis,
        replaceTaskEntries,
        appendAnalysisToTask,
        renameTask,
        deleteTask,
        deleteEntry,
        deleteDictationSession,
        recordDictationSession,
      }}
    >
      {children}
    </LearningTasksContext.Provider>
  );
}

export function useLearningTasks() {
  const context = useContext(LearningTasksContext);

  if (!context) {
    throw new Error("useLearningTasks must be used within LearningTasksProvider");
  }

  return context;
}

export { createTaskFromAnalysis };
