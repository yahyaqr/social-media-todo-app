import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { seedTodosByStage, stages, type StageId } from '../data/stages';
import { loadState, type PersistedState, type TodosByStage } from '../utils/storage';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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
  const normalizedTodosByStage = structuredClone(todosByStage);

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

  const rememberClientTag = (value?: string): void => {
    const normalized = normalizeClientTag(value);
    if (!normalized) {
      return;
    }

    if (!rememberedClientTags.value.includes(normalized)) {
      rememberedClientTags.value = [...rememberedClientTags.value, normalized].sort((a, b) =>
        a.localeCompare(b)
      );
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

    todosByStage.value[stageId].unshift({
      id: createId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      dueAt,
      clientTag: normalizedClientTag,
      links: normalizedLinks,
      content: normalizedContent
    });
  };

  const toggleTodo = (stageId: StageId, todoId: string): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (todo) {
      todo.done = !todo.done;
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
  };

  const deleteTodo = (stageId: StageId, todoId: string): void => {
    todosByStage.value[stageId] = todosByStage.value[stageId].filter((item) => item.id !== todoId);
  };

  const clearCompleted = (stageId: StageId): void => {
    todosByStage.value[stageId] = todosByStage.value[stageId].filter((item) => !item.done);
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
          links: normalizeLinks(todo.links ?? (legacy.link ? [legacy.link] : []))
        };
      });
    }
  };

  ensureStageShape();

  return {
    todosByStage,
    clientTags,
    stageProgress,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    clearCompleted,
    reorderTodo,
    moveTodoToStage
  };
});
