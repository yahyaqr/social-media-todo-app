<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useTodosStore } from '../stores/todos';
import { stages, type StageId, type Todo } from '../data/stages';
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
const selectedTodoId = ref<string | null>(null);

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
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }

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

const openDetails = (todoId: string): void => {
  if (!todos.value.some((item) => item.id === todoId)) {
    return;
  }

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
  pinned?: boolean;
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

const togglePinned = (stageId: StageId, todoId: string, pinned: boolean): void => {
  store.updateTodo(stageId, todoId, { pinned });
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
        @toggle-pinned="togglePinned"
        @select-inline-tag="setInlineTagFilter"
        @select-client-tag="setClientTagFilter"
      />
    </ul>

    <p v-else class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>

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


