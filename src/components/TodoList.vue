<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useTodosStore } from '../stores/todos';
import type { StageId, Todo } from '../data/stages';
import TodoItem from './TodoItem.vue';

type FilterMode = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

const props = defineProps<{
  stageId: StageId;
}>();

const store = useTodosStore();
const newTodoText = ref('');
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

const dueDate = ref(getNextStageDate(props.stageId));
const clientTag = ref('');
const link = ref('');
const filter = ref<FilterMode>('all');
const draggingTodoId = ref<string | null>(null);
const clientTagsListId = computed(() => `saved-client-tags-${props.stageId}`);
const detailClientTagsListId = computed(() => `detail-client-tags-${props.stageId}`);
const selectedTodoId = ref<string | null>(null);
const detailTitle = ref('');
const detailDueDate = ref('');
const detailClientTag = ref('');
const detailLink = ref('');
const detailContent = ref('');
const detailContentInput = ref<HTMLTextAreaElement | null>(null);

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

const parseDueAt = (): number | undefined => {
  if (!dueDate.value) {
    return undefined;
  }

  const parsed = new Date(`${dueDate.value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseDate = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const submitTodo = () => {
  store.addTodo(props.stageId, newTodoText.value, parseDueAt(), clientTag.value, link.value);
  newTodoText.value = '';
  dueDate.value = getNextStageDate(props.stageId);
  clientTag.value = '';
  link.value = '';
};

const openDetails = (todoId: string): void => {
  const todo = todos.value.find((item) => item.id === todoId);
  if (!todo) {
    return;
  }

  selectedTodoId.value = todo.id;
  detailTitle.value = todo.text;
  detailDueDate.value = todo.dueAt ? formatDateInput(todo.dueAt) : '';
  detailClientTag.value = todo.clientTag ?? '';
  detailLink.value = todo.link ?? '';
  detailContent.value = todo.content ?? '';
};

const closeDetails = (): void => {
  selectedTodoId.value = null;
};

const normalizeBulletLines = (value: string): string => {
  return value
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)(?:[-*]|•)\s+(.*)$/);
      if (!match) {
        return line;
      }
      return `${match[1]}• ${match[2]}`;
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
    const bulletMatch = line.match(/^\s*•\s+(.*)$/);
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
          class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition active:scale-[0.98]"
          aria-label="Add todo"
          title="Add todo"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="dueDate"
          type="date"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-blue-300 focus:ring-2"
          aria-label="Due date"
        />
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="clientTag"
          type="text"
          :list="clientTagsListId"
          placeholder="Client tag (optional)"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
          aria-label="Client tag"
        />
        <datalist :id="clientTagsListId">
          <option v-for="tag in store.clientTags" :key="tag" :value="tag" />
        </datalist>
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="link"
          type="url"
          placeholder="Link (optional)"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
          aria-label="Link"
        />
      </div>
    </form>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        v-for="mode in ['all', 'today', 'upcoming', 'overdue', 'completed']"
        :key="mode"
        type="button"
        class="uppercase rounded-full px-3 py-1 text-sm font-medium"
        :class="filter === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'"
        @click="filter = mode as FilterMode"
      >
        {{ mode }}
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
        @open-details="openDetails"
      />
    </ul>

    <p v-else class="mt-4 rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      No tasks in this filter yet.
    </p>

    <div
      v-if="selectedTodo"
      class="fixed inset-0 z-50 overflow-y-auto bg-slate-100 p-4 md:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div class="mx-auto w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 md:p-6">
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            @click="closeDetails"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
          <label class="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 accent-blue-600"
              :checked="selectedTodo.done"
              @change="toggleDetailsDone(($event.target as HTMLInputElement).checked)"
            />
            Completed
          </label>
        </div>

        <div class="mt-4 space-y-3">
          <input
            v-model="detailTitle"
            type="text"
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold text-slate-900 outline-none ring-blue-300 focus:ring-2"
            placeholder="Task title"
            @input="saveDetails"
          />

          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              v-model="detailDueDate"
              type="date"
              class="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
              aria-label="Due date"
              @change="saveDetails"
            />
            <input
              v-model="detailClientTag"
              type="text"
              :list="detailClientTagsListId"
              placeholder="Client tag"
              class="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
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
        </div>

        <div class="mt-5">
          <div class="mb-2 flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-700">Full Content</h3>
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              title="Bold (Ctrl/Cmd+B)"
              @click="wrapContentSelectionBold"
            >
              Bold
            </button>
          </div>
          <textarea
            ref="detailContentInput"
            v-model="detailContent"
            rows="10"
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
            placeholder="Write notes. Start a line with - or * for bullets. Use **bold** or Ctrl/Cmd+B."
            @input="onContentInput"
            @keydown="onContentKeydown"
          />

          <div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Formatted Preview</p>
            <div v-if="contentPreview.length" class="space-y-1 text-sm text-slate-800">
              <div
                v-for="(line, index) in contentPreview"
                :key="index"
                class="flex items-start gap-2"
                :class="{ 'pl-0': !line.isBullet }"
              >
                <span v-if="line.isBullet" class="mt-[1px] text-slate-500">•</span>
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
  </section>
</template>
