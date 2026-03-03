<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useTodosStore } from '../stores/todos';
import { useAuthStore } from '../stores/auth';
import { stages, type StageId, type Todo } from '../data/stages';
import AddTaskSheet from './AddTaskSheet.vue';
import BasicDropdown from './BasicDropdown.vue';
import TaskDetailSheet from './TaskDetailSheet.vue';
import TodoItem from './TodoItem.vue';

type FilterMode = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
const ALL_CLIENT_TAGS = '__all_client_tags__';
const UNTAGGED_CLIENT_TAG = '__untagged_client_tag__';

const props = defineProps<{
  stageId: StageId;
}>();

const store = useTodosStore();
const authStore = useAuthStore();
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
const clientTagFilter = ref<string>(ALL_CLIENT_TAGS);
const inlineTagFilter = ref<string | null>(null);
const filterOptions: Array<{ value: FilterMode; label: string }> = [
  { value: 'all', label: 'All status' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' }
];


const draggingTodoId = ref<string | null>(null);
const isAddTaskSheetOpen = ref(false);
const selectedTodoId = ref<string | null>(null);
const isProfileOpen = ref(false);

const todos = computed(() => store.todosByStage[props.stageId]);
const stageClientTags = computed(() => {
  const tags = new Set<string>();
  for (const todo of todos.value) {
    const tag = todo.clientTag?.trim();
    if (tag) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
});
const clientTagFilterOptions = computed<Array<{ value: string; label: string }>>(() => [
  { value: ALL_CLIENT_TAGS, label: 'All clients' },
  { value: UNTAGGED_CLIENT_TAG, label: 'No client tag' },
  ...stageClientTags.value.map((tag) => ({ value: tag, label: tag }))
]);
const selectedTodo = computed(() => todos.value.find((todo) => todo.id === selectedTodoId.value) ?? null);
const currentStageIndex = computed(() => stages.findIndex((stage) => stage.id === props.stageId));
const canUndo = computed(() => currentStageIndex.value > 0);
const canAdvance = computed(() => currentStageIndex.value >= 0 && currentStageIndex.value < stages.length - 1);
const canCreateTask = computed(() => store.cloudReady);

const dayBoundaries = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
};

const toTextContent = (value?: string): string => {
  const source = value ?? '';
  if (!source.includes('<')) {
    return source;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');
  return doc.body.textContent ?? '';
};

const extractInlineTags = (todo: Todo): string[] => {
  const source = `${todo.text}\n${toTextContent(todo.content)}`;
  const matches = source.match(/@[A-Za-z0-9_]+|#[A-Za-z0-9_-]+/g) ?? [];
  return [...new Set(matches)];
};

const filteredTodos = computed(() => {
  const { start, end } = dayBoundaries();
  const list = [...todos.value];

  list.sort((a, b) => {
    const aTag = (a.clientTag ?? '').trim().toLowerCase();
    const bTag = (b.clientTag ?? '').trim().toLowerCase();

    if (aTag && !bTag) {
      return -1;
    }

    if (!aTag && bTag) {
      return 1;
    }

    if (aTag !== bTag) {
      return aTag.localeCompare(bTag);
    }

    const aDue = a.dueAt ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    return b.createdAt - a.createdAt;
  });

  if (filter.value === 'today') {
    return list.filter(
      (todo) =>
        !todo.done &&
        todo.dueAt !== undefined &&
        todo.dueAt >= start &&
        todo.dueAt < end &&
        matchesClientTagFilter(todo) &&
        matchesInlineTagFilter(todo)
    );
  }

  if (filter.value === 'upcoming') {
    return list.filter(
      (todo) =>
        !todo.done &&
        todo.dueAt !== undefined &&
        todo.dueAt >= end &&
        matchesClientTagFilter(todo) &&
        matchesInlineTagFilter(todo)
    );
  }

  if (filter.value === 'overdue') {
    return list.filter(
      (todo) =>
        todo.dueAt !== undefined &&
        todo.dueAt < start &&
        !todo.done &&
        matchesClientTagFilter(todo) &&
        matchesInlineTagFilter(todo)
    );
  }

  if (filter.value === 'completed') {
    return list.filter((todo) => todo.done && matchesClientTagFilter(todo) && matchesInlineTagFilter(todo));
  }

  return list.filter((todo) => !todo.done && matchesClientTagFilter(todo) && matchesInlineTagFilter(todo));
});

const matchesClientTagFilter = (todo: Todo): boolean => {
  if (clientTagFilter.value === ALL_CLIENT_TAGS) {
    return true;
  }

  if (clientTagFilter.value === UNTAGGED_CLIENT_TAG) {
    return !todo.clientTag?.trim();
  }

  return (todo.clientTag ?? '').trim() === clientTagFilter.value;
};

const matchesInlineTagFilter = (todo: Todo): boolean => {
  if (!inlineTagFilter.value) {
    return true;
  }

  return extractInlineTags(todo).includes(inlineTagFilter.value);
};

const parseDate = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const openAddTaskSheet = (): void => {
  if (!canCreateTask.value) {
    return;
  }

  isAddTaskSheetOpen.value = true;
};

const closeAddTaskSheet = (): void => {
  isAddTaskSheetOpen.value = false;
};

const toggleProfile = (): void => {
  isProfileOpen.value = !isProfileOpen.value;
};

const closeProfile = (): void => {
  isProfileOpen.value = false;
};

const signOut = async (): Promise<void> => {
  try {
    await authStore.signOutCurrentUser();
    closeProfile();
  } catch {
    // App auth state will surface errors in the auth screen.
  }
};

const submitFromSheet = (payload: {
  text: string;
  dueDate: string;
  clientTag: string;
  links: string[];
}): void => {
  if (!canCreateTask.value) {
    return;
  }

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

const setInlineTagFilter = (tag: string): void => {
  inlineTagFilter.value = tag;
};

const clearInlineTagFilter = (): void => {
  inlineTagFilter.value = null;
};

const isMentionInlineTagFilter = computed(() => inlineTagFilter.value?.startsWith('@') ?? false);

watch(stageClientTags, (tags) => {
  if (
    clientTagFilter.value !== ALL_CLIENT_TAGS &&
    clientTagFilter.value !== UNTAGGED_CLIENT_TAG &&
    !tags.includes(clientTagFilter.value)
  ) {
    clientTagFilter.value = ALL_CLIENT_TAGS;
  }
});

const setClientTagFilter = (tag: string): void => {
  clientTagFilter.value = tag;
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
  linkCaptions?: string[];
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
      :can-submit="canCreateTask"
      @close="closeAddTaskSheet"
      @submit="submitFromSheet"
    />

    <div class="flex gap-2">
      <BasicDropdown class="w-1/2" v-model="filter" :options="filterOptions" label="Filter" />
      <BasicDropdown class="w-1/2" v-model="clientTagFilter" :options="clientTagFilterOptions" label="Client Tag" />
    </div>
    <div
      v-if="inlineTagFilter"
      class="mt-2 inline-flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-medium"
      :class="
        isMentionInlineTagFilter
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      "
    >
      <span class="truncate">Filtering by {{ inlineTagFilter }}</span>
      <button
        type="button"
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        :class="isMentionInlineTagFilter ? 'text-sky-700 hover:bg-sky-100' : 'text-emerald-700 hover:bg-emerald-100'"
        aria-label="Clear tag filter"
        title="Clear filter"
        @click="clearInlineTagFilter"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
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
        @drag-start="onDragStart"
        @drag-drop="onDragDrop"
        @open-details="openDetails"
        @select-inline-tag="setInlineTagFilter"
        @select-client-tag="setClientTagFilter"
      />
    </ul>

    <p v-else class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>

    <div
      v-if="!selectedTodo && !isAddTaskSheetOpen"
      class="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-full px-4 z-30 flex justify-between items-center gap-2"
    >
      <button
        type="button"
        class="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg transition hover:bg-slate-100 active:scale-[0.98]"
        aria-label="Open account menu"
        title="Account"
        @click="toggleProfile"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20a8 8 0 0116 0" />
        </svg>
      </button>

      <button
        type="button"
        class="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="!canCreateTask"
        @click="openAddTaskSheet"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        Add Task
      </button>
    </div>
    <p
      v-if="!canCreateTask && !selectedTodo && !isAddTaskSheetOpen"
      class="fixed bottom-[calc(0.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 text-xs font-medium text-slate-500"
    >
      Connecting to cloud sync...
    </p>

    <div v-if="isProfileOpen" class="fixed inset-0 z-30" @click="closeProfile" />
    <section
      v-if="isProfileOpen"
      class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-40 w-[min(88vw,19rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:right-6"
      @click.stop
    >
      <p class="truncate text-xs font-medium text-slate-500">Signed in as</p>
      <p class="truncate text-sm font-semibold text-slate-900">{{ authStore.user?.email ?? 'No email' }}</p>
      <button
        type="button"
        class="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        @click="signOut"
      >
        Sign Out
      </button>
    </section>

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


