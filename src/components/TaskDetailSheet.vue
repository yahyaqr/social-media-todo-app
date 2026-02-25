<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { StageId, Todo } from '../data/stages';

type TaskUpdates = {
  text?: string;
  dueAt?: number;
  done?: boolean;
  clientTag?: string;
  link?: string;
  content?: string;
};

type ContentSegment = {
  text: string;
  bold: boolean;
};

type ContentLine = {
  isBullet: boolean;
  segments: ContentSegment[];
};

const props = defineProps<{
  visible: boolean;
  todo: Todo | null;
  stageId: StageId;
  clientTags: string[];
  canUndo: boolean;
  canAdvance: boolean;
}>();

const emit = defineEmits<{
  close: [];
  delete: [];
  update: [updates: TaskUpdates];
  undo: [];
  advance: [];
}>();

const detailTitle = ref('');
const detailDueDate = ref('');
const detailClientTag = ref('');
const detailLink = ref('');
const detailContent = ref('');
const detailContentInput = ref<HTMLTextAreaElement | null>(null);
const showContentPreview = ref(false);

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

const parseDate = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
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

watch(
  () => props.todo,
  (todo) => {
    if (!todo) {
      return;
    }

    detailTitle.value = todo.text;
    detailDueDate.value = formatDateInput(todo.dueAt);
    detailClientTag.value = todo.clientTag ?? '';
    detailLink.value = todo.link ?? '';
    detailContent.value = todo.content ?? '';
    showContentPreview.value = false;
  },
  { immediate: true }
);

const saveDetails = (): void => {
  const trimmedTitle = detailTitle.value.trim();
  if (!trimmedTitle) {
    return;
  }

  emit('update', {
    text: trimmedTitle,
    dueAt: parseDate(detailDueDate.value),
    clientTag: detailClientTag.value,
    link: detailLink.value,
    content: normalizeBulletLines(detailContent.value)
  });
};

const toggleDone = (done: boolean): void => {
  emit('update', { done });
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

const onContentKeydown = (event: KeyboardEvent): void => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    wrapContentSelectionBold();
  }
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

const createdLabel = computed(() => {
  if (!props.todo) {
    return '';
  }
  return new Date(props.todo.createdAt).toLocaleString();
});
</script>

<template>
  <div v-if="visible && todo" class="fixed inset-0 z-50 bg-slate-100/95 md:p-8" role="dialog" aria-modal="true">
    <div class="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col bg-white shadow-xl ring-1 ring-slate-200 md:h-[calc(100dvh-4rem)] md:rounded-2xl overflow-hidden">
      <div class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="Back"
          title="Back"
          @click="emit('close')"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div class="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold transition sm:text-sm"
            :class="
              todo.done
                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
            "
            :aria-pressed="todo.done"
            title="Toggle completed"
            @click="toggleDone(!todo.done)"
          >
            <span
              class="inline-flex h-4 w-4 items-center justify-center rounded-full border transition"
              :class="todo.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white text-transparent'"
            >
              <svg viewBox="0 0 24 24" class="h-3 w-3 transition" :class="todo.done ? 'scale-100' : 'scale-75'" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            Completed
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
              class="date-input min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-blue-300 focus:ring-2"
              aria-label="Due date"
              @change="saveDetails"
            />
            <input
              v-model="detailClientTag"
              type="text"
              list="detail-client-tags"
              placeholder="Client tag"
              class="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
              aria-label="Client tag"
              @change="saveDetails"
            />
            <datalist id="detail-client-tags">
              <option v-for="tag in clientTags" :key="tag" :value="tag" />
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
            Created {{ createdLabel }}
          </div>

          <div class="mt-5">
            <div class="mb-2 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-700">Full Content</h3>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                  title="Bold (Ctrl/Cmd+B)"
                  aria-label="Bold"
                  @click="wrapContentSelectionBold"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M7 6h7a3 3 0 010 6H7z" />
                    <path d="M7 12h8a3 3 0 010 6H7z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                  title="Insert bullet"
                  aria-label="Insert bullet"
                  @click="insertBulletAtCaret"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 6h13" />
                    <path d="M8 12h13" />
                    <path d="M8 18h13" />
                    <path d="M3 6h.01" />
                    <path d="M3 12h.01" />
                    <path d="M3 18h.01" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                  :aria-label="showContentPreview ? 'Hide preview' : 'Show preview'"
                  :title="showContentPreview ? 'Hide preview' : 'Show preview'"
                  @click="showContentPreview = !showContentPreview"
                >
                  <svg v-if="showContentPreview" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a3 3 0 004.2 4.2" />
                    <path d="M9.9 5.1A10.9 10.9 0 0121 12a10.9 10.9 0 01-4.1 5.1" />
                    <path d="M6.7 6.7A10.9 10.9 0 003 12a10.9 10.9 0 004.1 5.1" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
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

            <div class="mt-3 flex justify-between gap-2">
              <button
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                aria-label="Delete task"
                title="Delete"
                @click="emit('delete')"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>

              <div class="flex gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Undo to previous stage"
                  title="Undo"
                  :disabled="!canUndo"
                  @click="emit('undo')"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 7L5 12l5 5" />
                    <path d="M5 12h9a5 5 0 010 10h-3" />
                  </svg>
                </button>
  
                <button
                  type="button"
                  class="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 px-3 text-xs font-medium text-emerald-700 enabled:hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                  :disabled="!canAdvance"
                  @click="emit('advance')"
                >
                  Advance →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
