"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createTaskFromAnalysis,
  createTaskFromUpload,
  getActiveUserKey,
  getDictationHistoryStorageKey,
  getTasksStorageKey,
  type DictationSession,
  initialRecognitionTasks,
  type RecognitionTask,
} from "@/lib/learning-store";

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
  }) => void;
  appendAnalysisToTask: (params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    feishuLink?: string;
  }) => void;
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
    return parsed.length > 0 ? parsed : [];
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

export function LearningTasksProvider({ children }: { children: ReactNode }) {
  const [activeUserKey, setActiveUserKeyState] = useState("guest");
  const [tasks, setTasks] = useState<RecognitionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [practiceHistory, setPracticeHistory] = useState<DictationSession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const syncUser = () => {
      setActiveUserKeyState(getActiveUserKey());
    };

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener("aura-active-user-change", syncUser as EventListener);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(
        "aura-active-user-change",
        syncUser as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const nextTasks = readStoredTasks(activeUserKey);
    const nextHistory = readStoredHistory(activeUserKey);
    const frame = window.requestAnimationFrame(() => {
      setTasks(nextTasks);
      setPracticeHistory(nextHistory);
      setSelectedTaskId(nextTasks[0]?.id ?? "");
      setHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeUserKey]);

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
    return task;
  }

  function addTaskFromAnalysis(task: RecognitionTask) {
    setTasks((current) => [task, ...current]);
    setSelectedTaskId(task.id);
    return task;
  }

  function appendAnalysisToTask(params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
    feishuLink?: string;
  }) {
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

        return {
          ...task,
          rawText: [task.rawText, params.rawText].filter(Boolean).join("\n\n"),
          feishuLink: params.feishuLink ?? task.feishuLink,
          entries: mergedEntries,
        };
      }),
    );
    setSelectedTaskId(params.taskId);
  }

  function replaceTaskEntries(params: {
    taskId: string;
    rawText?: string;
    entries: RecognitionTask["entries"];
  }) {
    setTasks((current) =>
      current.map((task) =>
        task.id === params.taskId
          ? {
              ...task,
              rawText: params.rawText ?? task.rawText,
              entries: params.entries,
            }
          : task,
      ),
    );
    setSelectedTaskId(params.taskId);
  }

  function renameTask(taskId: string, name: string) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, name } : task)),
    );
  }

  function deleteTask(taskId: string) {
    setTasks((current) => {
      const next = current.filter((task) => task.id !== taskId);
      setSelectedTaskId((selected) =>
        selected === taskId ? next[0]?.id ?? "" : selected,
      );
      return next;
    });
  }

  function deleteEntry(params: { taskId: string; entryId: string }) {
    setTasks((current) =>
      current.map((task) =>
        task.id === params.taskId
          ? {
              ...task,
              entries: task.entries.filter((entry) => entry.id !== params.entryId),
            }
          : task,
      ),
    );
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
    return nextSession;
  }

  function deleteDictationSession(sessionId: string) {
    setPracticeHistory((current) =>
      current.filter((session) => session.id !== sessionId),
    );
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
