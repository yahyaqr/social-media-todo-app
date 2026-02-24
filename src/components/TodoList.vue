<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTodosStore } from '../stores/todos';
import type { StageId, Todo } from '../data/stages';
import TodoItem from './TodoItem.vue';

type FilterMode = 'all' | 'today' | 'upcoming' | 'overdue';

const props = defineProps<{
  stageId: StageId;
}>();

const store = useTodosStore();
const newTodoText = ref('');
const dueDate = ref('');
const filter = ref<FilterMode>('all');
const draggingTodoId = ref<string | null>(null);

const todos = computed(() => store.todosByStage[props.stageId]);
const hasCompleted = computed(() => todos.value.some((todo) => todo.done));

const dayBoundaries = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
};

const filteredTodos = computed(() => {
  const { start, end } = dayBoundaries();

  const list = [...todos.value];

  list.sort((a, b) => {
    const aDue = a.dueAt ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    return b.createdAt - a.createdAt;
  });

  if (filter.value === 'today') {
    return list.filter((todo) => todo.dueAt !== undefined && todo.dueAt >= start && todo.dueAt < end);
  }

  if (filter.value === 'upcoming') {
    return list.filter((todo) => todo.dueAt !== undefined && todo.dueAt >= end);
  }

  if (filter.value === 'overdue') {
    return list.filter((todo) => todo.dueAt !== undefined && todo.dueAt < start && !todo.done);
  }

  return list;
});

const parseDueAt = (): number | undefined => {
  if (!dueDate.value) {
    return undefined;
  }

  const parsed = new Date(`${dueDate.value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const submitTodo = () => {
  store.addTodo(props.stageId, newTodoText.value, parseDueAt());
  newTodoText.value = '';
  dueDate.value = '';
};

const applyTemplate = () => {
  store.addTemplateTodos(props.stageId);
};

const onDragStart = (todoId: string) => {
  draggingTodoId.value = todoId;
};

const onDragDrop = (targetId: string) => {
  if (!draggingTodoId.value) {
    return;
  }

  store.reorderTodo(props.stageId, draggingTodoId.value, targetId);
  draggingTodoId.value = null;
};

const isDragging = (todo: Todo) => draggingTodoId.value === todo.id;
</script>

<template>
  <section class="rounded-2xl bg-slate-50 p-4 shadow-sm ring-1 ring-slate-200">
    <form class="space-y-2" @submit.prevent="submitTodo">
      <div class="flex gap-2">
        <input
          v-model="newTodoText"
          type="text"
          placeholder="Add a task..."
          class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
        />
        <button
          type="submit"
          class="rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.98]"
        >
          Add
        </button>
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="dueDate"
          type="date"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-blue-300 focus:ring-2"
          aria-label="Due date"
        />
        <button
          type="button"
          class="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          @click="applyTemplate"
        >
          Add template
        </button>
      </div>
    </form>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        v-for="mode in ['all', 'today', 'upcoming', 'overdue']"
        :key="mode"
        type="button"
        class="rounded-full px-3 py-1 text-sm font-medium"
        :class="filter === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'"
        @click="filter = mode as FilterMode"
      >
        {{ mode }}
      </button>
    </div>

    <div class="mt-4 flex items-center justify-end">
      <button
        type="button"
        class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
        :disabled="!hasCompleted"
        @click="store.clearCompleted(stageId)"
      >
        Clear completed
      </button>
    </div>

    <ul v-if="filteredTodos.length" class="mt-3 space-y-3">
      <TodoItem
        v-for="todo in filteredTodos"
        :key="todo.id"
        :stage-id="stageId"
        :todo="todo"
        :dragging="isDragging(todo)"
        @toggle="store.toggleTodo"
        @update-todo="store.updateTodo"
        @remove="store.deleteTodo"
        @drag-start="onDragStart"
        @drag-drop="onDragDrop"
      />
    </ul>

    <p v-else class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>
  </section>
</template>
