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
  }) => void;
  appendAnalysisToTask: (params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    properNouns?: RecognitionTask["properNouns"];
    feishuLink?: string;
  }) => RecognitionTask | null;
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

export function LearningTasksProvider({ children }: { children: ReactNode }) {
  const [activeUserKey, setActiveUserKeyState] = useState("guest");
  const [cloudUserId, setCloudUserId] = useState<null | string>(null);
  const [tasks, setTasks] = useState<RecognitionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [practiceHistory, setPracticeHistory] = useState<DictationSession[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const pendingDeletedTaskIdsRef = useRef<Set<string>>(new Set());
  const pendingDeletedEntryIdsRef = useRef<Map<string, Set<string>>>(new Map());

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

    async function hydrateData({ forceCloudRefresh = false } = {}) {
      const nextTasks = readStoredTasks(activeUserKey)
        .filter((task) => !pendingDeletedTaskIdsRef.current.has(task.id))
        .map((task) => filterTaskPendingDeletedEntries(task, pendingDeletedEntryIdsRef.current));
      const nextHistory = readStoredHistory(activeUserKey);
      const browserClient = getSupabaseBrowserClient();

      if (!cloudUserId || !browserClient || !hasSupabaseEnv()) {
        if (cancelled) {
          return;
        }

        setTasks(nextTasks);
        setPracticeHistory(nextHistory);
        setSelectedTaskId(nextTasks[0]?.id ?? "");
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

        setTasks(resolvedTasks);
        setPracticeHistory(resolvedHistory);
        setSelectedTaskId(resolvedTasks[0]?.id ?? "");
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

        setTasks(nextTasks);
        setPracticeHistory(nextHistory);
        setSelectedTaskId(nextTasks[0]?.id ?? "");
        setHydrated(true);
      }
    }

    void hydrateData();

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void hydrateData({ forceCloudRefresh: true });
      }
    };

    const handleFocusRefresh = () => {
      void hydrateData({ forceCloudRefresh: true });
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
    setTasks((current) => [task, ...current]);
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
    setTasks((current) => [sanitizedTask, ...current]);
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
    let nextTask: null | RecognitionTask = null;
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== params.taskId) {
          return task;
        }

        const existingKeys = new Set(
          task.entries.map((entry) => `${entry.sentence}__${entry.vocabulary}`),
        );
        const mergedEntries = [
          ...task.entries,
          ...params.entries.filter(
            (entry) => !existingKeys.has(`${entry.sentence}__${entry.vocabulary}`),
          ),
        ];
        const existingProperNounKeys = new Set(
          (task.properNouns ?? []).map((entry) => `${entry.sentence}__${entry.vocabulary}`),
        );
        const mergedProperNouns = [
          ...(task.properNouns ?? []),
          ...((params.properNouns ?? []).filter(
            (entry) => !existingProperNounKeys.has(`${entry.sentence}__${entry.vocabulary}`),
          ) as RecognitionTask["entries"]),
        ];

        nextTask = sanitizeRecognitionTaskEntries({
          ...task,
          rawText: [task.rawText, params.rawText].filter(Boolean).join("\n\n"),
          feishuLink: params.feishuLink ?? task.feishuLink,
          entries: mergedEntries,
          properNouns: mergedProperNouns,
        });
        return nextTask;
      }),
    );
    setSelectedTaskId(params.taskId);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask).catch((error) => {
        console.error("Failed to append task analysis to cloud", error);
      });
    }

    return nextTask;
  }

  function replaceTaskEntries(params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    properNouns?: RecognitionTask["properNouns"];
  }) {
    let nextTask: null | RecognitionTask = null;
    setTasks((current) =>
      current.map((task) =>
        task.id === params.taskId
          ? (nextTask = sanitizeRecognitionTaskEntries({
              ...task,
              rawText: params.rawText ?? task.rawText,
              entries: params.entries,
              properNouns: params.properNouns ?? task.properNouns ?? [],
            }))
          : task,
      ),
    );
    setSelectedTaskId(params.taskId);
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask).catch((error) => {
        console.error("Failed to replace task entries in cloud", error);
      });
    }
  }

  function renameTask(taskId: string, name: string) {
    let nextTask: null | RecognitionTask = null;
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? (nextTask = { ...task, name }) : task,
      ),
    );
    const browserClient = getSupabaseBrowserClient();
    if (browserClient && cloudUserId && nextTask) {
      void upsertTaskToCloud(browserClient, cloudUserId, nextTask).catch((error) => {
        console.error("Failed to rename task in cloud", error);
      });
    }
  }

  function deleteTask(taskId: string) {
    pendingDeletedTaskIdsRef.current.add(taskId);
    setTasks((current) => {
      const next = current.filter((task) => task.id !== taskId);
      writeStoredTasks(activeUserKey, next);
      setSelectedTaskId((selected) =>
        selected === taskId ? next[0]?.id ?? "" : selected,
      );
      return next;
    });
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
    let nextTask: null | RecognitionTask = null;
    setTasks((current) =>
      {
        const nextTasks = current.map((task) => {
        if (task.id !== params.taskId) {
          return task;
        }

        nextTask = {
          ...task,
          entries: task.entries.filter((entry) => entry.id !== params.entryId),
          properNouns: (task.properNouns ?? []).filter((entry) => entry.id !== params.entryId),
        };
        return nextTask;
        });

        writeStoredTasks(activeUserKey, nextTasks);
        return nextTasks;
      },
    );
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
