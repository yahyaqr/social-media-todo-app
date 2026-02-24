<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useTodosStore } from '../stores/todos';
import type { StageId, Todo } from '../data/stages';
import AddTaskSheet from './AddTaskSheet.vue';
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
const draggingTodoId = ref<string | null>(null);
const detailClientTagsListId = computed(() => `detail-client-tags-${props.stageId}`);
const isAddTaskSheetOpen = ref(false);
const selectedTodoId = ref<string | null>(null);
const detailTitle = ref('');
const detailDueDate = ref('');
const detailClientTag = ref('');
const detailLink = ref('');
const detailContent = ref('');
const detailContentInput = ref<HTMLTextAreaElement | null>(null);
const showContentPreview = ref(false);

const todos = computed(() => store.todosByStage[props.stageId]);
const selectedTodo = computed(() =>
  todos.value.find((todo) => todo.id === selectedTodoId.value) ?? null
);

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

const submitFromSheet = (payload: { text: string; dueDate: string; clientTag: string; link: string }): void => {
  store.addTodo(props.stageId, payload.text, parseDate(payload.dueDate), payload.clientTag, payload.link);
};

const openDetails = (todoId: string): void => {
  const todo = todos.value.find((item) => item.id === todoId);
  if (!todo) {
    return;
  }

  isAddTaskSheetOpen.value = false;
  selectedTodoId.value = todo.id;
  detailTitle.value = todo.text;
  detailDueDate.value = todo.dueAt ? formatDateInput(todo.dueAt) : '';
  detailClientTag.value = todo.clientTag ?? '';
  detailLink.value = todo.link ?? '';
  detailContent.value = todo.content ?? '';
};

const closeDetails = (): void => {
  selectedTodoId.value = null;
  showContentPreview.value = false;
};

const deleteSelectedTodo = (): void => {
  const todo = selectedTodo.value;
  if (!todo) {
    return;
  }

  store.deleteTodo(props.stageId, todo.id);
  closeDetails();
};

const normalizeBulletLines = (value: string): string => {
  return value
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)(?:[-*]|•)\s+(.*)$/);
      if (!match) {
        return line;
      }
      return `${match[1]}- ${match[2]}`;
    })
    .join('\n');
};

const saveDetails = (): void => {
  const todo = selectedTodo.value;
  if (!todo) {
    return;
  }

  const trimmedTitle = detailTitle.value.trim();
  if (!trimmedTitle) {
    return;
  }

  store.updateTodo(props.stageId, todo.id, {
    text: trimmedTitle,
    dueAt: parseDate(detailDueDate.value),
    clientTag: detailClientTag.value,
    link: detailLink.value,
    content: normalizeBulletLines(detailContent.value)
  });
};

const toggleDetailsDone = (done: boolean): void => {
  const todo = selectedTodo.value;
  if (!todo) {
    return;
  }

  store.updateTodo(props.stageId, todo.id, { done });
};

const onContentInput = (): void => {
  const normalized = normalizeBulletLines(detailContent.value);
  if (normalized !== detailContent.value) {
    detailContent.value = normalized;
  }

  saveDetails();
};

const wrapContentSelectionBold = (): void => {
  const input = detailContentInput.value;
  if (!input) {
    return;
  }

  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = detailContent.value.slice(start, end);
  const before = detailContent.value.slice(0, start);
  const after = detailContent.value.slice(end);
  const insert = `**${selected || 'bold text'}**`;
  detailContent.value = `${before}${insert}${after}`;

  void nextTick(() => {
    const focusStart = start + 2;
    const focusEnd = selected ? end + 2 : start + 11;
    input.focus();
    input.setSelectionRange(focusStart, focusEnd);
  });

  saveDetails();
};

const onContentKeydown = (event: KeyboardEvent): void => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    wrapContentSelectionBold();
  }
};

const insertBulletAtCaret = (): void => {
  const input = detailContentInput.value;
  if (!input) {
    return;
  }

  const start = input.selectionStart;
  const end = input.selectionEnd;
  const before = detailContent.value.slice(0, start);
  const after = detailContent.value.slice(end);
  const prefix = start === 0 || detailContent.value[start - 1] === '\n' ? '- ' : '\n- ';

  detailContent.value = `${before}${prefix}${after}`;

  void nextTick(() => {
    const cursor = start + prefix.length;
    input.focus();
    input.setSelectionRange(cursor, cursor);
  });

  saveDetails();
};

type ContentSegment = {
  text: string;
  bold: boolean;
};

type ContentLine = {
  isBullet: boolean;
  segments: ContentSegment[];
};

const splitBoldSegments = (text: string): ContentSegment[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const isBold = /^\*\*[^*]+\*\*$/.test(part);
    return {
      text: isBold ? part.slice(2, -2) : part,
      bold: isBold
    };
  });
};

const contentPreview = computed<ContentLine[]>(() => {
  if (!detailContent.value.trim()) {
    return [];
  }

  return detailContent.value.split('\n').map((line) => {
    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    const text = bulletMatch ? bulletMatch[1] : line;
    return {
      isBullet: Boolean(bulletMatch),
      segments: splitBoldSegments(text)
    };
  });
});

const detailCreatedLabel = computed(() => {
  if (!selectedTodo.value) {
    return '';
  }

  return new Date(selectedTodo.value.createdAt).toLocaleString();
});

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

    <div class="relative mt-4">
      <div class="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-slate-50 to-transparent" />
      <div class="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-slate-50 to-transparent" />
      <div class="flex items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          v-for="mode in ['all', 'today', 'upcoming', 'overdue', 'completed']"
          :key="mode"
          type="button"
          class="min-h-8 shrink-0 uppercase rounded-full px-3 py-1 text-xs font-medium"
          :class="filter === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'"
          @click="filter = mode as FilterMode"
        >
          {{ mode }}
        </button>
      </div>
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
      />
    </ul>

    <p v-else class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>

    <button
      v-if="!selectedTodo && !isAddTaskSheetOpen"
      type="button"
      class="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 active:scale-[0.98] sm:right-6"
      @click="openAddTaskSheet"
    >
      Add Task +
    </button>

    <div v-if="selectedTodo" class="fixed inset-0 z-50 bg-slate-100/95 md:p-8" role="dialog" aria-modal="true">
      <div class="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col bg-white shadow-xl ring-1 ring-slate-200 md:h-[calc(100dvh-4rem)] md:rounded-2xl">
        <div class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            @click="closeDetails"
          >
            <span aria-hidden="true">&larr;</span>
            Back
          </button>
          <div class="flex items-center gap-1.5 sm:gap-2">
            <label class="inline-flex items-center gap-2 text-xs text-slate-700 sm:text-sm">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 accent-blue-600"
                :checked="selectedTodo.done"
                @change="toggleDetailsDone(($event.target as HTMLInputElement).checked)"
              />
              Completed
            </label>
            <button
              type="button"
              class="inline-flex h-8 items-center justify-center rounded-lg border border-rose-300 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 sm:h-9 sm:px-3 sm:text-sm"
              @click="deleteSelectedTodo"
            >
              Delete
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-3 sm:p-4">
          <div class="space-y-3">
          <input
            v-model="detailTitle"
            type="text"
            class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg font-semibold text-slate-900 outline-none ring-blue-300 focus:ring-2 sm:px-4 sm:py-3 sm:text-xl"
            placeholder="Task title"
            @input="saveDetails"
          />

          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              v-model="detailDueDate"
              type="date"
              class="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
              aria-label="Due date"
              @change="saveDetails"
            />
            <input
              v-model="detailClientTag"
              type="text"
              :list="detailClientTagsListId"
              placeholder="Client tag"
              class="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
              aria-label="Client tag"
              @change="saveDetails"
            />
            <datalist :id="detailClientTagsListId">
              <option v-for="tag in store.clientTags" :key="tag" :value="tag" />
            </datalist>
            <input
              v-model="detailLink"
              type="url"
              placeholder="Link"
              class="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2 md:col-span-2"
              aria-label="Task link"
              @change="saveDetails"
            />
          </div>

          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Created {{ detailCreatedLabel }}
          </div>
          <div class="mt-5">
            <div class="mb-2 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-700">Full Content</h3>
            </div>
          <textarea
            ref="detailContentInput"
            v-model="detailContent"
            rows="12"
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
            placeholder="Write notes. Start a line with - or * for bullets. Use **bold** or Ctrl/Cmd+B."
            @input="onContentInput"
            @keydown="onContentKeydown"
          />

          <div v-if="showContentPreview" class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Formatted Preview</p>
            <div v-if="contentPreview.length" class="space-y-1 text-sm text-slate-800">
              <div
                v-for="(line, index) in contentPreview"
                :key="index"
                class="flex items-start gap-2"
                :class="{ 'pl-0': !line.isBullet }"
              >
                <span v-if="line.isBullet" class="mt-[1px] text-slate-500">&bull;</span>
                <span>
                  <template v-for="(segment, segmentIndex) in line.segments" :key="`${index}-${segmentIndex}`">
                    <strong v-if="segment.bold">{{ segment.text }}</strong>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </span>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">No content yet.</p>
          </div>
          </div>
        </div>
        </div>

        <div class="sticky bottom-0 z-20 flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3 sm:p-4">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              title="Bold (Ctrl/Cmd+B)"
              @click="wrapContentSelectionBold"
            >
              Bold
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              title="Insert bullet"
              @click="insertBulletAtCaret"
            >
              Bullet
            </button>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            @click="showContentPreview = !showContentPreview"
          >
            {{ showContentPreview ? 'Hide Preview' : 'Show Preview' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
