import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { seedTodosByStage, stages, type StageId, type Todo } from '../data/stages';
import {
  ensureSignedInUid,
  hasAnyRemoteData,
  importStateToCloud,
  saveCloudClientTags,
  subscribeToCloudState,
  syncCloudStageOrder,
  upsertCloudTodo,
  deleteCloudTodo,
  type CloudSnapshot
} from '../services/firestoreTodos';
import { isFirebaseConfigured } from '../lib/firebase';
import { loadState, type PersistedState, type TodosByStage } from '../utils/storage';

const CLOUD_MIGRATION_KEY = 'sm_todo_cloud_migrated_v1';

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

const createInitialState = (): PersistedState => {
  const loaded = loadState();
  const todosByStage = loaded?.todosByStage ?? structuredClone(seedTodosByStage);
  const normalizedTodosByStage: TodosByStage = {
    ...createEmptyTodosByStage(),
    ...structuredClone(todosByStage)
  };

  for (const stage of stages) {
    const list = normalizedTodosByStage[stage.id] ?? [];
    normalizedTodosByStage[stage.id] = list.map((todo) => {
      const legacy = todo as typeof todo & { link?: string };
      const normalized = normalizeLinks(todo.links ?? (legacy.link ? [legacy.link] : []));
      return {
        ...todo,
        links: normalized
      };
    });
  }
  const clientTags = buildClientTagCatalog(normalizedTodosByStage, loaded?.clientTags ?? []);

  return { todosByStage: normalizedTodosByStage, clientTags };
};

export const useTodosStore = defineStore('todos', () => {
  const initialState = createInitialState();
  const todosByStage = ref<TodosByStage>(initialState.todosByStage);
  const rememberedClientTags = ref<string[]>(initialState.clientTags ?? []);
  const cloudReady = ref(false);
  const cloudError = ref<string | null>(null);

  const cloudUid = ref<string | null>(null);
  let cloudUnsubscribe: (() => void) | null = null;
  let cloudInitPromise: Promise<void> | null = null;

  const runCloudWrite = (action: (uid: string) => Promise<void>): void => {
    const uid = cloudUid.value;
    if (!uid) {
      return;
    }

    void action(uid).catch((error: unknown) => {
      cloudError.value = error instanceof Error ? error.message : 'Cloud sync failed.';
    });
  };

  const applyCloudSnapshot = (snapshot: CloudSnapshot): void => {
    const nextTodosByStage: TodosByStage = {
      ...createEmptyTodosByStage(),
      ...snapshot.todosByStage
    };

    for (const stage of stages) {
      const list = nextTodosByStage[stage.id] ?? [];
      nextTodosByStage[stage.id] = list.map((todo) => ({
        ...todo,
        links: normalizeLinks(todo.links ?? []),
        clientTag: normalizeClientTag(todo.clientTag),
        content: normalizeContent(todo.content)
      }));
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
    });
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
    const tags = new Set(rememberedClientTags.value);

    for (const stage of stages) {
      for (const todo of todosByStage.value[stage.id]) {
        const tag = normalizeClientTag(todo.clientTag);
        if (tag) {
          tags.add(tag);
        }
      }
    }

    return [...tags].sort((a, b) => a.localeCompare(b));
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
      clientTag?: string;
      links?: string[];
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

    if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
      todo.content = normalizeContent(updates.content);
    }

    if (updates.done !== undefined) {
      todo.done = updates.done;
    }

    syncTodoAt(stageId, todoId);
  };

  const deleteTodo = (stageId: StageId, todoId: string): void => {
    const before = todosByStage.value[stageId].length;
    todosByStage.value[stageId] = todosByStage.value[stageId].filter((item) => item.id !== todoId);

    if (todosByStage.value[stageId].length === before) {
      return;
    }

    runCloudWrite((uid) => deleteCloudTodo(uid, todoId));
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

    syncTodoAt(toStageId, moved.id);
    syncStageOrder(fromStageId);
    syncStageOrder(toStageId);
    return true;
  };

  const ensureStageShape = (): void => {
    for (const stage of stages) {
      if (!Array.isArray(todosByStage.value[stage.id])) {
        todosByStage.value[stage.id] = [];
      }

      todosByStage.value[stage.id] = todosByStage.value[stage.id].map((todo) => {
        const legacy = todo as typeof todo & { link?: string };
        return {
          ...todo,
          links: normalizeLinks(todo.links ?? (legacy.link ? [legacy.link] : [])),
          clientTag: normalizeClientTag(todo.clientTag),
          content: normalizeContent(todo.content)
        };
      });
    }
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

        const shouldMigrate = localStorage.getItem(CLOUD_MIGRATION_KEY) !== '1';
        const remoteHasData = await hasAnyRemoteData(uid);

        if (shouldMigrate && !remoteHasData) {
          const migrationState: PersistedState = {
            todosByStage: structuredClone(todosByStage.value),
            clientTags: [...clientTags.value]
          };

          await importStateToCloud(uid, migrationState);
        }

        if (shouldMigrate) {
          localStorage.setItem(CLOUD_MIGRATION_KEY, '1');
        }

        cloudUnsubscribe = subscribeToCloudState(
          uid,
          (snapshot) => {
            applyCloudSnapshot(snapshot);
            cloudReady.value = true;
            cloudError.value = null;
          },
          (error) => {
            cloudError.value = error instanceof Error ? error.message : 'Cloud sync listener failed.';
          }
        );
      } catch (error) {
        cloudError.value = error instanceof Error ? error.message : 'Failed to initialize cloud sync.';
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

    cloudReady.value = false;
    cloudUid.value = null;
  };

  ensureStageShape();

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
    stopCloudSync
  };
});
