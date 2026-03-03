import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { stages, type StageId, type Todo } from '../data/stages';
import {
  ensureSignedInUid,
  saveCloudClientTags,
  subscribeToCloudState,
  syncCloudStageOrders,
  syncCloudStageOrder,
  upsertCloudTodo,
  deleteCloudTodo,
  type CloudSnapshot,
  type TodosByStage
} from '../services/firestoreTodos';
import { isFirebaseConfigured } from '../lib/firebase';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyTodosByStage = (): TodosByStage => ({
  ideation: [],
  research: [],
  draft: [],
  produce: [],
  publish: []
});

const normalizeLink = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const normalizeLinks = (values: string[] = []): string[] | undefined => {
  const unique = new Set<string>();

  for (const value of values) {
    const normalized = normalizeLink(value);
    if (normalized) {
      unique.add(normalized);
    }
  }

  const normalizedList = [...unique];
  return normalizedList.length ? normalizedList : undefined;
};

const normalizeLinkCaptions = (values: string[] = [], linkCount = values.length): string[] | undefined => {
  if (linkCount <= 0) {
    return undefined;
  }

  const normalized = Array.from({ length: linkCount }, (_, index) => {
    const value = values[index];
    return typeof value === 'string' ? value.trim() : '';
  });

  return normalized.some(Boolean) ? normalized : undefined;
};

const normalizeClientTag = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const normalizeContent = (value?: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();

  return normalized || undefined;
};

const buildClientTagCatalog = (todosByStage: TodosByStage, existing: string[] = []): string[] => {
  const tags = new Set(existing.map((tag) => tag.trim()).filter(Boolean));

  for (const stage of stages) {
    const list = Array.isArray(todosByStage[stage.id]) ? todosByStage[stage.id] : [];
    for (const todo of list) {
      const tag = normalizeClientTag(todo.clientTag);
      if (tag) {
        tags.add(tag);
      }
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
};

const CLOUD_RETRY_BASE_DELAY_MS = 1000;
const CLOUD_RETRY_MAX_DELAY_MS = 30000;

type CloudWriteContext = {
  stageId?: StageId;
  todoId?: string;
};

type PendingCloudWrite = {
  action: (uid: string) => Promise<void>;
  context?: CloudWriteContext;
};

const toActionableCloudError = (error: unknown, fallback: string): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';

  if (code === 'permission-denied') {
    return 'Cloud sync denied by Firestore rules. Sign in with the correct account and verify rules allow this user.';
  }

  if (code === 'unauthenticated') {
    return 'Cloud sync requires authentication. Please sign in again.';
  }

  if (code === 'unavailable') {
    return 'Cloud sync is temporarily unavailable. Check network connection and retry.';
  }

  if (code === 'failed-precondition') {
    return 'Cloud sync failed precondition. Check Firebase project config and Firestore setup.';
  }

  if (code === 'deadline-exceeded') {
    return 'Cloud sync timed out. Check your connection and retry.';
  }

  return error instanceof Error && error.message ? error.message : fallback;
};

export const useTodosStore = defineStore('todos', () => {
  const todosByStage = ref<TodosByStage>(createEmptyTodosByStage());
  const rememberedClientTags = ref<string[]>([]);
  const cloudReady = ref(false);
  const cloudError = ref<string | null>(null);

  const cloudUid = ref<string | null>(null);
  let cloudUnsubscribe: (() => void) | null = null;
  let cloudInitPromise: Promise<void> | null = null;
  let cloudRetryTimeoutId: number | null = null;
  let cloudRetryAttempts = 0;
  const pendingCloudWrites: PendingCloudWrite[] = [];

  const clearCloudRetryTimeout = (): void => {
    if (cloudRetryTimeoutId === null) {
      return;
    }

    window.clearTimeout(cloudRetryTimeoutId);
    cloudRetryTimeoutId = null;
  };

  const markTodoSyncFailed = (stageId: StageId, todoId: string, errorMessage: string): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    todo.syncPending = false;
    todo.syncFailed = true;
    todo.syncError = errorMessage;
  };

  const markTodoSyncPending = (stageId: StageId, todoId: string): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    todo.syncPending = true;
    todo.syncFailed = false;
    todo.syncError = undefined;
  };

  const clearTodoSyncFailed = (stageId: StageId, todoId: string): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    if (todo.syncPending || todo.syncFailed || todo.syncError) {
      todo.syncPending = false;
      todo.syncFailed = false;
      todo.syncError = undefined;
    }
  };

  const scheduleCloudInitRetry = (): void => {
    if (cloudReady.value || cloudInitPromise || cloudRetryTimeoutId !== null) {
      return;
    }

    const delay = Math.min(CLOUD_RETRY_MAX_DELAY_MS, CLOUD_RETRY_BASE_DELAY_MS * 2 ** cloudRetryAttempts);
    cloudRetryAttempts += 1;

    cloudRetryTimeoutId = window.setTimeout(() => {
      cloudRetryTimeoutId = null;
      void initCloudSync();
    }, delay);
  };

  const flushPendingCloudWrites = (): void => {
    const uid = cloudUid.value;
    if (!uid || !pendingCloudWrites.length) {
      return;
    }

    const queuedActions = [...pendingCloudWrites];
    pendingCloudWrites.length = 0;

    for (const { action, context } of queuedActions) {
      void action(uid)
        .then(() => {
          if (context?.stageId && context.todoId) {
            clearTodoSyncFailed(context.stageId, context.todoId);
          }
        })
        .catch((error: unknown) => {
          const actionableError = toActionableCloudError(error, 'Cloud sync failed.');
          console.error('[cloud-write] failed while flushing queued action', error);
          cloudError.value = actionableError;
          if (context?.stageId && context.todoId) {
            markTodoSyncFailed(context.stageId, context.todoId, actionableError);
          }
          scheduleCloudInitRetry();
        });
    }
  };

  const runCloudWrite = (action: (uid: string) => Promise<void>, context?: CloudWriteContext): void => {
    if (context?.stageId && context.todoId) {
      markTodoSyncPending(context.stageId, context.todoId);
    }

    const uid = cloudUid.value;
    if (!uid) {
      pendingCloudWrites.push({ action, context });
      return;
    }

    void action(uid)
      .then(() => {
        if (context?.stageId && context.todoId) {
          clearTodoSyncFailed(context.stageId, context.todoId);
        }
      })
      .catch((error: unknown) => {
        const actionableError = toActionableCloudError(error, 'Cloud sync failed.');
        console.error('[cloud-write] failed', error);
        cloudError.value = actionableError;
        if (context?.stageId && context.todoId) {
          markTodoSyncFailed(context.stageId, context.todoId, actionableError);
        }
        scheduleCloudInitRetry();
      });
  };

  const applyCloudSnapshot = (snapshot: CloudSnapshot): void => {
    const localUnsyncedByStage: TodosByStage = createEmptyTodosByStage();
    for (const stage of stages) {
      localUnsyncedByStage[stage.id] = (todosByStage.value[stage.id] ?? []).filter(
        (todo) => todo.syncPending || todo.syncFailed
      );
    }

    const nextTodosByStage: TodosByStage = {
      ...createEmptyTodosByStage(),
      ...snapshot.todosByStage
    };

    for (const stage of stages) {
      const list = nextTodosByStage[stage.id] ?? [];
      nextTodosByStage[stage.id] = list.map((todo) => ({
        ...todo,
        pinned: Boolean(todo.pinned),
        syncPending: false,
        syncFailed: false,
        syncError: undefined,
        links: normalizeLinks(todo.links ?? []),
        linkCaptions: normalizeLinkCaptions(todo.linkCaptions ?? [], todo.links?.length ?? 0),
        clientTag: normalizeClientTag(todo.clientTag),
        content: normalizeContent(todo.content)
      }));

      const presentIds = new Set(nextTodosByStage[stage.id].map((todo) => todo.id));
      const missingUnsyncedLocals = localUnsyncedByStage[stage.id].filter((todo) => !presentIds.has(todo.id));
      if (missingUnsyncedLocals.length) {
        nextTodosByStage[stage.id] = [...missingUnsyncedLocals, ...nextTodosByStage[stage.id]];
      }
    }

    todosByStage.value = nextTodosByStage;
    rememberedClientTags.value = buildClientTagCatalog(nextTodosByStage, snapshot.clientTags);
  };

  const syncCurrentTags = (): void => {
    runCloudWrite((uid) => saveCloudClientTags(uid, rememberedClientTags.value));
  };

  const syncTodoAt = (stageId: StageId, todoId: string): void => {
    runCloudWrite(async (uid) => {
      const index = todosByStage.value[stageId].findIndex((item) => item.id === todoId);
      if (index < 0) {
        return;
      }

      const todo = todosByStage.value[stageId][index];
      await upsertCloudTodo(uid, stageId, todo, index);
    }, { stageId, todoId });
  };

  const syncStageOrder = (stageId: StageId): void => {
    runCloudWrite((uid) => syncCloudStageOrder(uid, stageId, todosByStage.value[stageId]));
  };

  const rememberClientTag = (value?: string): void => {
    const normalized = normalizeClientTag(value);
    if (!normalized) {
      return;
    }

    if (!rememberedClientTags.value.includes(normalized)) {
      rememberedClientTags.value = [...rememberedClientTags.value, normalized].sort((a, b) =>
        a.localeCompare(b)
      );
      syncCurrentTags();
    }
  };

  const clientTags = computed(() => {
    return buildClientTagCatalog(todosByStage.value, []);
  });

  const stageProgress = computed(() => (stageId: StageId): string => {
    const list = todosByStage.value[stageId] ?? [];
    const doneCount = list.filter((item) => item.done).length;
    return `${doneCount}/${list.length} done`;
  });

  const addTodo = (
    stageId: StageId,
    text: string,
    dueAt?: number,
    clientTag?: string,
    links?: string[],
    content?: string
  ): void => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const normalizedClientTag = normalizeClientTag(clientTag);
    const normalizedLinks = normalizeLinks(links);
    const normalizedContent = normalizeContent(content);

    rememberClientTag(normalizedClientTag);

    const todo: Todo = {
      id: createId(),
      text: trimmed,
      done: false,
      pinned: false,
      createdAt: Date.now(),
      dueAt,
      clientTag: normalizedClientTag,
      links: normalizedLinks,
      content: normalizedContent
    };

    todosByStage.value[stageId].unshift(todo);

    syncTodoAt(stageId, todo.id);
    syncStageOrder(stageId);
  };

  const toggleTodo = (stageId: StageId, todoId: string): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (todo) {
      todo.done = !todo.done;
      syncTodoAt(stageId, todoId);
    }
  };

  const updateTodo = (
    stageId: StageId,
    todoId: string,
    updates: {
      text?: string;
      dueAt?: number;
      done?: boolean;
      pinned?: boolean;
      clientTag?: string;
      links?: string[];
      linkCaptions?: string[];
      content?: string;
    }
  ): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    if (updates.text !== undefined) {
      const trimmed = updates.text.trim();
      if (!trimmed) {
        return;
      }
      todo.text = trimmed;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'dueAt')) {
      todo.dueAt = updates.dueAt;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'clientTag')) {
      todo.clientTag = normalizeClientTag(updates.clientTag);
      rememberClientTag(todo.clientTag);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'links')) {
      todo.links = normalizeLinks(updates.links ?? []);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'linkCaptions')) {
      todo.linkCaptions = normalizeLinkCaptions(updates.linkCaptions ?? [], todo.links?.length ?? 0);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
      todo.content = normalizeContent(updates.content);
    }

    if (updates.done !== undefined) {
      todo.done = updates.done;
    }

    if (updates.pinned !== undefined) {
      todo.pinned = updates.pinned;
    }

    syncTodoAt(stageId, todoId);
  };

  const deleteTodo = (stageId: StageId, todoId: string): void => {
    const before = todosByStage.value[stageId].length;
    todosByStage.value[stageId] = todosByStage.value[stageId].filter((item) => item.id !== todoId);

    if (todosByStage.value[stageId].length === before) {
      return;
    }

    runCloudWrite((uid) => deleteCloudTodo(uid, todoId), { stageId, todoId });
    syncStageOrder(stageId);
  };

  const clearCompleted = (stageId: StageId): void => {
    const completedIds = todosByStage.value[stageId]
      .filter((item) => item.done)
      .map((item) => item.id);

    if (!completedIds.length) {
      return;
    }

    todosByStage.value[stageId] = todosByStage.value[stageId].filter((item) => !item.done);

    runCloudWrite(async (uid) => {
      await Promise.all(completedIds.map((todoId) => deleteCloudTodo(uid, todoId)));
    });
    syncStageOrder(stageId);
  };

  const reorderTodo = (stageId: StageId, draggedId: string, targetId: string): void => {
    if (draggedId === targetId) {
      return;
    }

    const list = [...todosByStage.value[stageId]];
    const from = list.findIndex((item) => item.id === draggedId);
    const to = list.findIndex((item) => item.id === targetId);

    if (from < 0 || to < 0) {
      return;
    }

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    todosByStage.value[stageId] = list;
    syncStageOrder(stageId);
  };

  const moveTodoToStage = (fromStageId: StageId, todoId: string, toStageId: StageId): boolean => {
    if (fromStageId === toStageId) {
      return false;
    }

    const source = [...todosByStage.value[fromStageId]];
    const index = source.findIndex((item) => item.id === todoId);
    if (index < 0) {
      return false;
    }

    const [moved] = source.splice(index, 1);
    todosByStage.value[fromStageId] = source;
    todosByStage.value[toStageId] = [moved, ...todosByStage.value[toStageId]];

    runCloudWrite((uid) =>
      syncCloudStageOrders(uid, [
        { stageId: fromStageId, todos: todosByStage.value[fromStageId] },
        { stageId: toStageId, todos: todosByStage.value[toStageId] }
      ])
    );
    return true;
  };

  const initCloudSync = async (): Promise<void> => {
    if (cloudReady.value || cloudInitPromise) {
      return cloudInitPromise ?? Promise.resolve();
    }

    if (!isFirebaseConfigured) {
      cloudError.value = 'Firebase is not configured. Cloud sync is disabled.';
      return;
    }

    cloudInitPromise = (async () => {
      try {
        const uid = await ensureSignedInUid();
        cloudUid.value = uid;
        flushPendingCloudWrites();

        if (cloudUnsubscribe) {
          cloudUnsubscribe();
          cloudUnsubscribe = null;
        }

        cloudUnsubscribe = subscribeToCloudState(
          uid,
          (snapshot) => {
            applyCloudSnapshot(snapshot);
            cloudReady.value = true;
            cloudError.value = null;
            cloudRetryAttempts = 0;
            clearCloudRetryTimeout();
          },
          (error) => {
            if (cloudUnsubscribe) {
              cloudUnsubscribe();
              cloudUnsubscribe = null;
            }
            cloudReady.value = false;
            cloudError.value = toActionableCloudError(error, 'Cloud sync listener failed.');
            console.error('[cloud-listener] failed', error);
            scheduleCloudInitRetry();
          }
        );
      } catch (error) {
        cloudReady.value = false;
        cloudError.value = toActionableCloudError(error, 'Failed to initialize cloud sync.');
        console.error('[cloud-init] failed', error);
        scheduleCloudInitRetry();
      } finally {
        cloudInitPromise = null;
      }
    })();

    return cloudInitPromise;
  };

  const stopCloudSync = (): void => {
    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }

    todosByStage.value = createEmptyTodosByStage();
    rememberedClientTags.value = [];
    cloudReady.value = false;
    cloudUid.value = null;
    cloudRetryAttempts = 0;
    clearCloudRetryTimeout();
    pendingCloudWrites.length = 0;
  };

  const retryCloudSync = (): void => {
    cloudError.value = null;
    clearCloudRetryTimeout();
    void initCloudSync();
  };

  return {
    todosByStage,
    clientTags,
    stageProgress,
    cloudReady,
    cloudError,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    clearCompleted,
    reorderTodo,
    moveTodoToStage,
    initCloudSync,
    retryCloudSync,
    stopCloudSync
  };
});
