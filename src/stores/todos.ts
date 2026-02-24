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

const normalizeClientTag = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
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
  const clientTags = buildClientTagCatalog(todosByStage, loaded?.clientTags ?? []);

  return { todosByStage, clientTags };
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
    link?: string
  ): void => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const normalizedClientTag = normalizeClientTag(clientTag);
    const normalizedLink = normalizeLink(link);

    rememberClientTag(normalizedClientTag);

    todosByStage.value[stageId].unshift({
      id: createId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      dueAt,
      clientTag: normalizedClientTag,
      link: normalizedLink
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
      link?: string;
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

    if (Object.prototype.hasOwnProperty.call(updates, 'link')) {
      todo.link = normalizeLink(updates.link);
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

  const ensureStageShape = (): void => {
    for (const stage of stages) {
      if (!Array.isArray(todosByStage.value[stage.id])) {
        todosByStage.value[stage.id] = [];
      }
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
    reorderTodo
  };
});
