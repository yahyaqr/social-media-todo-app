<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTodosStore } from '../stores/todos';
import { stages, type StageId, type Todo } from '../data/stages';
import AddTaskSheet from './AddTaskSheet.vue';
import BasicDropdown from './BasicDropdown.vue';
import TaskDetailSheet from './TaskDetailSheet.vue';
import TodoItem from './TodoItem.vue';

type FilterMode = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

const props = defineProps<{
  stageId: StageId;
}>();

const store = useTodosStore();
const stageWeekday: Record<StageId, number> = {
  ideation: 1,
  research: 2,
  draft: 3,
  produce: 4,
  publish: 5
};

const formatDateInput = (timestamp: number): string => {
  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextStageDate = (stageId: StageId): string => {
  const now = new Date();
  const targetWeekday = stageWeekday[stageId];
  const dayOffset = (targetWeekday - now.getDay() + 7) % 7;
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  return formatDateInput(targetDate.getTime());
};

const filter = ref<FilterMode>('all');
const filterOptions: Array<{ value: FilterMode; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' }
];

const draggingTodoId = ref<string | null>(null);
const isAddTaskSheetOpen = ref(false);
const selectedTodoId = ref<string | null>(null);

const todos = computed(() => store.todosByStage[props.stageId]);
const selectedTodo = computed(() => todos.value.find((todo) => todo.id === selectedTodoId.value) ?? null);
const currentStageIndex = computed(() => stages.findIndex((stage) => stage.id === props.stageId));
const canUndo = computed(() => currentStageIndex.value > 0);
const canAdvance = computed(() => currentStageIndex.value >= 0 && currentStageIndex.value < stages.length - 1);

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
    return list.filter((todo) => !todo.done && todo.dueAt !== undefined && todo.dueAt >= start && todo.dueAt < end);
  }

  if (filter.value === 'upcoming') {
    return list.filter((todo) => !todo.done && todo.dueAt !== undefined && todo.dueAt >= end);
  }

  if (filter.value === 'overdue') {
    return list.filter((todo) => todo.dueAt !== undefined && todo.dueAt < start && !todo.done);
  }

  if (filter.value === 'completed') {
    return list.filter((todo) => todo.done);
  }

  return list.filter((todo) => !todo.done);
});

const parseDate = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const openAddTaskSheet = (): void => {
  isAddTaskSheetOpen.value = true;
};

const closeAddTaskSheet = (): void => {
  isAddTaskSheetOpen.value = false;
};

const submitFromSheet = (payload: {
  text: string;
  dueDate: string;
  clientTag: string;
  links: string[];
}): void => {
  store.addTodo(props.stageId, payload.text, parseDate(payload.dueDate), payload.clientTag, payload.links);
};

const openDetails = (todoId: string): void => {
  if (!todos.value.some((item) => item.id === todoId)) {
    return;
  }

  isAddTaskSheetOpen.value = false;
  selectedTodoId.value = todoId;
};

const closeDetails = (): void => {
  selectedTodoId.value = null;
};

const deleteSelectedTodo = (): void => {
  const todo = selectedTodo.value;
  if (!todo) {
    return;
  }

  store.deleteTodo(props.stageId, todo.id);
  closeDetails();
};

const updateDetails = (updates: {
  text?: string;
  dueAt?: number;
  done?: boolean;
  clientTag?: string;
  links?: string[];
  content?: string;
}): void => {
  const todo = selectedTodo.value;
  if (!todo) {
    return;
  }

  store.updateTodo(props.stageId, todo.id, updates);
};

const moveSelectedTodo = (direction: -1 | 1): void => {
  const todo = selectedTodo.value;
  if (!todo) {
    return;
  }

  const nextIndex = currentStageIndex.value + direction;
  if (nextIndex < 0 || nextIndex >= stages.length) {
    return;
  }

  const targetStageId = stages[nextIndex].id;
  const moved = store.moveTodoToStage(props.stageId, todo.id, targetStageId);
  if (moved) {
    closeDetails();
  }
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
  <section class="rounded-2xl bg-slate-50 p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
    <AddTaskSheet
      :visible="isAddTaskSheetOpen"
      :initial-due-date="getNextStageDate(stageId)"
      :client-tags="store.clientTags"
      @close="closeAddTaskSheet"
      @submit="submitFromSheet"
    />

    <BasicDropdown v-model="filter" :options="filterOptions" label="Filter" />

    <ul v-if="filteredTodos.length" class="mt-3 space-y-3">
      <TodoItem
        v-for="todo in filteredTodos"
        :key="todo.id"
        :stage-id="stageId"
        :todo="todo"
        :dragging="isDragging(todo)"
        @toggle="store.toggleTodo"
        @drag-start="onDragStart"
        @drag-drop="onDragDrop"
        @open-details="openDetails"
      />
    </ul>

    <p v-else class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>

    <button
      v-if="!selectedTodo && !isAddTaskSheetOpen"
      type="button"
      class="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 active:scale-[0.98] sm:right-6"
      @click="openAddTaskSheet"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
      Add Task
    </button>

    <TaskDetailSheet
      :visible="Boolean(selectedTodo)"
      :todo="selectedTodo"
      :stage-id="stageId"
      :client-tags="store.clientTags"
      :can-undo="canUndo"
      :can-advance="canAdvance"
      @close="closeDetails"
      @delete="deleteSelectedTodo"
      @update="updateDetails"
      @undo="moveSelectedTodo(-1)"
      @advance="moveSelectedTodo(1)"
    />
  </section>
</template>
