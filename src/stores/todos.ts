import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { seedTodosByStage, stageTemplates, stages, type StageId, type Todo } from '../data/stages';
import { loadState, type PersistedState, type TodosByStage } from '../utils/storage';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createInitialTodos = (): TodosByStage => {
  const loaded = loadState();

  if (loaded?.todosByStage) {
    return loaded.todosByStage;
  }

  return structuredClone(seedTodosByStage);
};

export const useTodosStore = defineStore('todos', () => {
  const todosByStage = ref<TodosByStage>(createInitialTodos());

  const stageProgress = computed(() => (stageId: StageId): string => {
    const list = todosByStage.value[stageId] ?? [];
    const doneCount = list.filter((item) => item.done).length;
    return `${doneCount}/${list.length} done`;
  });

  const addTodo = (stageId: StageId, text: string, dueAt?: number): void => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    todosByStage.value[stageId].unshift({
      id: createId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      dueAt
    });
  };

  const addTemplateTodos = (stageId: StageId): void => {
    const now = Date.now();
    const template = stageTemplates[stageId];

    const additions = template.map((text, index) => ({
      id: createId(),
      text,
      done: false,
      createdAt: now + index
    }));

    todosByStage.value[stageId] = [...additions, ...todosByStage.value[stageId]];
  };

  const toggleTodo = (stageId: StageId, todoId: string): void => {
    const todo = todosByStage.value[stageId].find((item) => item.id === todoId);
    if (todo) {
      todo.done = !todo.done;
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
    stageProgress,
    addTodo,
    addTemplateTodos,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    reorderTodo
  };
});
