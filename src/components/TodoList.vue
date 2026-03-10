<script setup lang="ts">
import { GripHorizontal } from 'lucide-vue-next';
import Sortable, { type SortableEvent } from 'sortablejs';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTodosStore } from '../stores/todos';
import { type StageId, type Todo } from '../data/stages';
import BasicDropdown from './BasicDropdown.vue';
import TodoItem from './TodoItem.vue';

type FilterMode = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
const ALL_CLIENT_TAGS = '__all_client_tags__';
const UNTAGGED_CLIENT_TAG = '__untagged_client_tag__';
const FILTER_STORAGE_KEY_PREFIX = 'social-todo:filters:';
const FILTER_MODES: FilterMode[] = ['all', 'today', 'upcoming', 'overdue', 'completed'];

const props = defineProps<{
  stageId: StageId;
}>();

const router = useRouter();
const store = useTodosStore();

const getFilterStorageKey = (): string => `${FILTER_STORAGE_KEY_PREFIX}${props.stageId}`;

const loadPersistedFilters = (): { filter: FilterMode; clientTagFilter: string } => {
  const fallback = { filter: 'all' as FilterMode, clientTagFilter: ALL_CLIENT_TAGS };
  const raw = window.localStorage.getItem(getFilterStorageKey());
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { filter?: unknown; clientTagFilter?: unknown };
    const persistedFilter =
      typeof parsed.filter === 'string' && FILTER_MODES.includes(parsed.filter as FilterMode)
        ? (parsed.filter as FilterMode)
        : fallback.filter;
    const persistedClientTag =
      typeof parsed.clientTagFilter === 'string' ? parsed.clientTagFilter : fallback.clientTagFilter;

    return {
      filter: persistedFilter,
      clientTagFilter: persistedClientTag
    };
  } catch {
    return fallback;
  }
};

const persistedFilters = loadPersistedFilters();
const filter = ref<FilterMode>(persistedFilters.filter);
const clientTagFilter = ref<string>(persistedFilters.clientTagFilter);
const inlineTagFilter = ref<string | null>(null);
const filterOptions: Array<{ value: FilterMode; label: string }> = [
  { value: 'all', label: 'All status' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' }
];


const listElement = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;
const reorderNotice = ref<string | null>(null);
let reorderNoticeTimeoutId: number | null = null;
const reorderMode = ref(false);

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
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

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

const sortVisibleTodos = (list: Todo[]): Todo[] => {
  return [...list].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }

    if (clientTagFilter.value !== ALL_CLIENT_TAGS) {
      return 0;
    }

    const aTag = a.clientTag?.trim() ?? '';
    const bTag = b.clientTag?.trim() ?? '';

    if (!aTag && bTag) {
      return 1;
    }

    if (aTag && !bTag) {
      return -1;
    }

    const tagComparison = collator.compare(aTag, bTag);
    if (tagComparison !== 0) {
      return tagComparison;
    }

    return 0;
  });
};

const filteredTodos = computed(() => {
  const { start, end } = dayBoundaries();
  const list = todos.value;

  if (filter.value === 'today') {
    return sortVisibleTodos(list.filter(
      (todo) =>
        !todo.done &&
        todo.dueAt !== undefined &&
        todo.dueAt >= start &&
        todo.dueAt < end &&
        matchesClientTagFilter(todo) &&
        matchesInlineTagFilter(todo)
    ));
  }

  if (filter.value === 'upcoming') {
    return sortVisibleTodos(list.filter(
      (todo) =>
        !todo.done &&
        todo.dueAt !== undefined &&
        todo.dueAt >= end &&
        matchesClientTagFilter(todo) &&
        matchesInlineTagFilter(todo)
    ));
  }

  if (filter.value === 'overdue') {
    return sortVisibleTodos(list.filter(
      (todo) =>
        todo.dueAt !== undefined &&
        todo.dueAt < start &&
        !todo.done &&
        matchesClientTagFilter(todo) &&
        matchesInlineTagFilter(todo)
    ));
  }

  if (filter.value === 'completed') {
    return sortVisibleTodos(
      list.filter((todo) => todo.done && matchesClientTagFilter(todo) && matchesInlineTagFilter(todo))
    );
  }

  return sortVisibleTodos(
    list.filter((todo) => !todo.done && matchesClientTagFilter(todo) && matchesInlineTagFilter(todo))
  );
});
const canReorder = computed(() => !inlineTagFilter.value);

const clientTagGroupKey = (todo: Todo): string => (todo.clientTag ?? '').trim().toLowerCase();

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

  void router.push({ name: 'task-detail', params: { stageId: props.stageId, todoId } });
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

watch([filter, clientTagFilter], ([nextFilter, nextClientTagFilter]) => {
  window.localStorage.setItem(
    getFilterStorageKey(),
    JSON.stringify({ filter: nextFilter, clientTagFilter: nextClientTagFilter })
  );
});

const setClientTagFilter = (tag: string): void => {
  clientTagFilter.value = tag;
};

const togglePinned = (stageId: StageId, todoId: string, pinned: boolean): void => {
  store.updateTodo(stageId, todoId, { pinned });
};

const clearReorderNoticeTimeout = (): void => {
  if (reorderNoticeTimeoutId === null) {
    return;
  }

  window.clearTimeout(reorderNoticeTimeoutId);
  reorderNoticeTimeoutId = null;
};

const showReorderNotice = (message: string): void => {
  reorderNotice.value = message;
  clearReorderNoticeTimeout();
  reorderNoticeTimeoutId = window.setTimeout(() => {
    reorderNotice.value = null;
    reorderNoticeTimeoutId = null;
  }, 2200);
};

const onSortEnd = (event: SortableEvent): void => {
  if (!canReorder.value || !reorderMode.value) {
    return;
  }

  const oldIndex = event.oldIndex;
  const newIndex = event.newIndex;

  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
    return;
  }

  const visibleTodos = filteredTodos.value;
  if (oldIndex < 0 || newIndex < 0 || oldIndex >= visibleTodos.length || newIndex >= visibleTodos.length) {
    return;
  }

  const draggedId = visibleTodos[oldIndex]?.id;
  const targetId = visibleTodos[newIndex]?.id;
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  if (clientTagFilter.value === ALL_CLIENT_TAGS) {
    const draggedTodo = visibleTodos[oldIndex];
    const targetTodo = visibleTodos[newIndex];
    if (!draggedTodo || !targetTodo) {
      return;
    }

    // In "All clients", only allow reorder inside the same client-tag group.
    if (clientTagGroupKey(draggedTodo) !== clientTagGroupKey(targetTodo)) {
      showReorderNotice('In All clients, you can reorder only within the same client group.');
      return;
    }
  }

  store.reorderTodo(props.stageId, draggedId, targetId);
};

const ensureSortable = (): void => {
  if (!listElement.value || sortable) {
    return;
  }

  sortable = Sortable.create(listElement.value, {
    animation: 150,
    draggable: '.todo-sort-item',
    ghostClass: 'todo-sort-ghost',
    chosenClass: 'todo-sort-chosen',
    dragClass: 'todo-sort-drag',
    touchStartThreshold: 4,
    onEnd: onSortEnd
  });
  sortable.option('disabled', !canReorder.value || !reorderMode.value);
};

const destroySortable = (): void => {
  if (!sortable) {
    return;
  }

  sortable.destroy();
  sortable = null;
};

watch(listElement, (element) => {
  if (!element) {
    destroySortable();
    return;
  }

  ensureSortable();
});

watch(canReorder, (enabled) => {
  if (!enabled) {
    reorderMode.value = false;
  }

  sortable?.option('disabled', !enabled || !reorderMode.value);
});

watch(reorderMode, (enabled) => {
  sortable?.option('disabled', !canReorder.value || !enabled);
});

const toggleReorderMode = (): void => {
  if (!canReorder.value) {
    return;
  }

  reorderMode.value = !reorderMode.value;
};

onBeforeUnmount(() => {
  clearReorderNoticeTimeout();
  destroySortable();
});
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

    <p
      v-if="!canReorder && filteredTodos.length"
      class="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200"
    >
      Reordering is unavailable while inline tag filtering is active.
    </p>

    <ul
      ref="listElement"
      v-if="filteredTodos.length"
      class="mt-3 space-y-3 select-none"
      :class="{ 'todo-reorder-mode': reorderMode }"
    >
      <TodoItem
        v-for="todo in filteredTodos"
        :key="todo.id"
        :stage-id="stageId"
        :todo="todo"
        :reorder-mode="reorderMode"
        @toggle="store.toggleTodo"
        @open-details="openDetails"
        @toggle-pinned="togglePinned"
        @select-inline-tag="setInlineTagFilter"
        @select-client-tag="setClientTagFilter"
      />
    </ul>

    <div v-if="filteredTodos.length" class="mt-3 flex items-center gap-3">
      <div class="h-px flex-1 bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded-full transition"
        :class="
          canReorder
            ? reorderMode
              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            : 'cursor-not-allowed text-slate-300'
        "
        :disabled="!canReorder"
        :aria-label="reorderMode ? 'Done reordering' : 'Start reordering'"
        :title="reorderMode ? 'Done reordering' : 'Reorder tasks'"
        @click="toggleReorderMode"
      >
        <GripHorizontal class="h-4 w-4" aria-hidden="true" />
      </button>
      <div class="h-px flex-1 bg-slate-200" aria-hidden="true" />
    </div>

    <p
      v-if="filteredTodos.length && reorderNotice"
      class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
      role="status"
      aria-live="polite"
    >
      {{ reorderNotice }}
    </p>

    <p v-else-if="!filteredTodos.length" class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>
  </section>
</template>
