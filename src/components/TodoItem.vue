<script setup lang="ts">
import { computed, ref } from 'vue';
import type { StageId, Todo } from '../data/stages';
import { useTodosStore } from '../stores/todos';

type TodoUpdates = {
  text?: string;
  dueAt?: number;
  done?: boolean;
  clientTag?: string;
  link?: string;
  content?: string;
};

const props = defineProps<{
  stageId: StageId;
  todo: Todo;
  dragging?: boolean;
}>();
const store = useTodosStore();

const emit = defineEmits<{
  toggle: [stageId: StageId, todoId: string];
  remove: [stageId: StageId, todoId: string];
  dragStart: [todoId: string];
  dragDrop: [targetId: string];
  openDetails: [todoId: string];
  updateTodo: [stageId: StageId, todoId: string, updates: TodoUpdates];
}>();

const isEditing = ref(false);
const draftText = ref('');
const draftDueDate = ref('');
const draftClientTag = ref('');
const draftLink = ref('');
const editError = ref('');
const editClientTagsListId = computed(() => `edit-client-tags-${props.todo.id}`);

const formatDateInput = (timestamp?: number): string => {
  if (!timestamp) {
    return '';
  }

  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDueDate = (): number | undefined => {
  if (!draftDueDate.value) {
    return undefined;
  }

  const parsed = new Date(`${draftDueDate.value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const startEdit = (): void => {
  isEditing.value = true;
  draftText.value = props.todo.text;
  draftDueDate.value = formatDateInput(props.todo.dueAt);
  draftClientTag.value = props.todo.clientTag ?? '';
  draftLink.value = props.todo.link ?? '';
  editError.value = '';
};

const cancelEdit = (): void => {
  isEditing.value = false;
  editError.value = '';
};

const saveEdit = (): void => {
  const trimmed = draftText.value.trim();
  if (!trimmed) {
    editError.value = 'Task text is required.';
    return;
  }

  emit('updateTodo', props.stageId, props.todo.id, {
    text: trimmed,
    dueAt: parseDueDate(),
    clientTag: draftClientTag.value,
    link: draftLink.value
  });

  isEditing.value = false;
  editError.value = '';
};

const onDragStart = (): void => {
  if (isEditing.value) {
    return;
  }

  emit('dragStart', props.todo.id);
};

const onDragDrop = (): void => {
  if (isEditing.value) {
    return;
  }

  emit('dragDrop', props.todo.id);
};

const dueLabel = computed(() => {
  if (!props.todo.dueAt) {
    return '';
  }

  return new Date(props.todo.dueAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
});

const isOverdue = computed(() => {
  if (!props.todo.dueAt || props.todo.done) {
    return false;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return props.todo.dueAt < todayStart;
});

const timingClass = computed(() => {
  if (!props.todo.dueAt || props.todo.done) {
    return 'border-slate-200 bg-white';
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;

  if (props.todo.dueAt < todayStart) {
    return 'border-rose-200 bg-rose-50';
  }

  if (props.todo.dueAt < tomorrowStart) {
    return 'border-amber-200 bg-amber-50';
  }

  return 'border-sky-200 bg-sky-50';
});
</script>

<template>
  <li
    class="flex items-start gap-3 rounded-xl border p-4 shadow-sm"
    :class="[timingClass, { 'opacity-50': dragging }]"
    :draggable="!isEditing"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop="onDragDrop"
  >
    <input
      :id="todo.id"
      type="checkbox"
      :checked="todo.done"
      class="mt-1 h-6 w-6 rounded border-slate-300 text-blue-600 accent-blue-600"
      :disabled="isEditing"
      @change="emit('toggle', stageId, todo.id)"
    />

    <div class="min-w-0 flex-1">
      <template v-if="isEditing">
        <input
          v-model="draftText"
          type="text"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
          @keydown.enter.prevent="saveEdit"
          @keydown.esc.prevent="cancelEdit"
        />
        <input
          v-model="draftDueDate"
          type="date"
          class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
          @keydown.enter.prevent="saveEdit"
          @keydown.esc.prevent="cancelEdit"
        />
        <input
          v-model="draftClientTag"
          type="text"
          :list="editClientTagsListId"
          placeholder="Client tag (optional)"
          class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
          @keydown.enter.prevent="saveEdit"
          @keydown.esc.prevent="cancelEdit"
        />
        <datalist :id="editClientTagsListId">
          <option v-for="tag in store.clientTags" :key="tag" :value="tag" />
        </datalist>
        <input
          v-model="draftLink"
          type="url"
          placeholder="Link (optional)"
          class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
          @keydown.enter.prevent="saveEdit"
          @keydown.esc.prevent="cancelEdit"
        />
        <p v-if="editError" class="mt-1 text-xs text-rose-600">{{ editError }}</p>
      </template>

      <template v-else>
        <button
          type="button"
          class="block w-full text-left text-base leading-6 text-slate-800"
          :class="{ 'text-slate-400 line-through': todo.done }"
          @click="emit('openDetails', todo.id)"
        >
          {{ todo.text }}
        </button>
        <p v-if="dueLabel" class="mt-1 text-xs" :class="isOverdue ? 'text-rose-600' : 'text-slate-500'">
          Due {{ dueLabel }}
        </p>
        <div v-if="todo.clientTag || todo.link" class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span v-if="todo.clientTag" class="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            {{ todo.clientTag }}
          </span>
          <a
            v-if="todo.link"
            :href="todo.link"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full bg-blue-50 px-2 py-1 text-blue-700 hover:bg-blue-100"
          >
            Open link
          </a>
        </div>
      </template>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <template v-if="isEditing">
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Save todo"
          title="Save todo"
          @click="saveEdit"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </button>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Cancel edit"
          title="Cancel edit"
          @click="cancelEdit"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </template>

      <template v-else>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Edit todo"
          title="Edit todo"
          @click="startEdit"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Delete todo"
          @click="emit('remove', stageId, todo.id)"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </template>
    </div>
  </li>
</template>
