<script setup lang="ts">
import { Pin } from 'lucide-vue-next';
import { computed, onBeforeUnmount, ref } from 'vue';
import type { StageId, Todo } from '../data/stages';

const props = defineProps<{
  stageId: StageId;
  todo: Todo;
  reorderMode?: boolean;
}>();

const emit = defineEmits<{
  toggle: [stageId: StageId, todoId: string];
  openDetails: [todoId: string];
  togglePinned: [stageId: StageId, todoId: string, pinned: boolean];
  selectInlineTag: [tag: string];
  selectClientTag: [tag: string];
}>();

const HOLD_DURATION_MS = 350;
const PIN_SPINNER_SHOW_DELAY_MS = 0;
const PIN_COMMIT_MS = 350;
const holdTimeoutId = ref<number | null>(null);
const pinSpinnerStartTimeoutId = ref<number | null>(null);
const pinCommitTimeoutId = ref<number | null>(null);
const longPressTriggered = ref(false);
const isPinning = ref(false);
const pinPreview = ref<boolean | null>(null);

const clearHoldTimeout = (): void => {
  if (holdTimeoutId.value === null) {
    return;
  }

  window.clearTimeout(holdTimeoutId.value);
  holdTimeoutId.value = null;
};

const clearPinTimers = (): void => {
  if (pinSpinnerStartTimeoutId.value !== null) {
    window.clearTimeout(pinSpinnerStartTimeoutId.value);
    pinSpinnerStartTimeoutId.value = null;
  }
  if (pinCommitTimeoutId.value !== null) {
    window.clearTimeout(pinCommitTimeoutId.value);
    pinCommitTimeoutId.value = null;
  }
};

const startHold = (event: PointerEvent): void => {
  if (props.reorderMode) {
    return;
  }

  const target = event.target;
  if (target instanceof Element && target.closest('button, a, input, textarea, select, label')) {
    return;
  }

  if (isPinning.value || props.todo.pinned) {
    return;
  }

  clearHoldTimeout();
  clearPinTimers();
  longPressTriggered.value = false;
  holdTimeoutId.value = window.setTimeout(() => {
    longPressTriggered.value = true;
    pinPreview.value = true;

    pinSpinnerStartTimeoutId.value = window.setTimeout(() => {
      isPinning.value = true;
      pinSpinnerStartTimeoutId.value = null;
    }, PIN_SPINNER_SHOW_DELAY_MS);

    pinCommitTimeoutId.value = window.setTimeout(() => {
      emit('togglePinned', props.stageId, props.todo.id, true);
      isPinning.value = false;
      pinPreview.value = null;
      pinCommitTimeoutId.value = null;
    }, PIN_COMMIT_MS);
    holdTimeoutId.value = null;
  }, HOLD_DURATION_MS);
};

const cancelHold = (): void => {
  clearHoldTimeout();
};

const onPointerDown = (event: PointerEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
  startHold(event);
};

const onPointerUp = (event: PointerEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
  cancelHold();
};

const onPointerLeave = (event: PointerEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
  cancelHold();
};

const onPointerCancel = (event: PointerEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
  cancelHold();
};

const onTouchStart = (event: TouchEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
};

const onTouchMove = (event: TouchEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
};

const onTouchEnd = (event: TouchEvent): void => {
  if (!props.reorderMode) {
    event.stopPropagation();
  }
};

const openDetails = (): void => {
  if (props.reorderMode) {
    return;
  }

  if (longPressTriggered.value) {
    longPressTriggered.value = false;
    return;
  }

  emit('openDetails', props.todo.id);
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

const linkList = computed(() => props.todo.links ?? []);
const primaryLink = computed(() => linkList.value[0]);
const extraLinkCount = computed(() => Math.max(0, linkList.value.length - 1));
const toTextContent = (value?: string): string => {
  const source = value ?? '';
  if (!source.includes('<')) {
    return source;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');
  return doc.body.textContent ?? '';
};

const titleWithClientTag = computed(() => {
  const tag = props.todo.clientTag?.trim();
  const text = props.todo.text;
  if (!tag) {
    return { prefix: '', text };
  }

  const prefix = `${tag}:`;
  if (text.trimStart().toLowerCase().startsWith(prefix.toLowerCase())) {
    return { prefix, text };
  }

  return { prefix, text };
});
const inlineTags = computed(() => {
  const source = `${props.todo.text}\n${toTextContent(props.todo.content)}`;
  const matches = source.match(/@[A-Za-z0-9_]+|#[A-Za-z0-9_-]+/g) ?? [];
  return [...new Set(matches)];
});

const selectInlineTag = (tag: string): void => {
  emit('selectInlineTag', tag);
};

const selectClientTag = (tag: string): void => {
  emit('selectClientTag', tag);
};

const showPinnedIcon = computed(() => (pinPreview.value ?? props.todo.pinned) && !isPinning.value);

const unpinFromIndicator = (): void => {
  if (!props.todo.pinned || isPinning.value) {
    return;
  }

  emit('togglePinned', props.stageId, props.todo.id, false);
};

onBeforeUnmount(() => {
  clearHoldTimeout();
  clearPinTimers();
});
</script>

<template>
  <li
    class="todo-no-swipe swiper-no-swiping todo-sort-item relative flex items-start gap-2.5 rounded-xl border p-2.5 shadow-sm transition hover:shadow sm:gap-3 sm:p-3"
    :class="[timingClass, props.reorderMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer']"
    @click="openDetails"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
    @pointercancel="onPointerCancel"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <span
      v-if="isPinning"
      class="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center text-amber-600"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 11-6.2-8.56" />
      </svg>
    </span>
    <button
      v-else-if="todo.pinned"
      type="button"
      :disabled="props.reorderMode"
      class="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-blue-600 hover:bg-blue-100 disabled:opacity-40"
      aria-label="Unpin task"
      title="Unpin"
      @click.stop="unpinFromIndicator"
    >
      <Pin class="h-4 w-4" aria-hidden="true" />
    </button>
    <Pin
      v-else-if="showPinnedIcon"
      class="absolute right-2 top-2 h-4 w-4 text-amber-600"
      aria-hidden="true"
    />

    <input
      :id="todo.id"
      type="checkbox"
      :checked="todo.done"
      :disabled="props.reorderMode"
      class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 disabled:opacity-40"
      @click.stop
      @change="emit('toggle', stageId, todo.id)"
    />

    <div class="min-w-0 flex-1">
      <p
        class="line-clamp-2 text-sm font-normal leading-5 text-slate-800 sm:text-[0.95rem"
        :class="{ 'text-slate-400 line-through': todo.done }"
      >
        <span v-if="titleWithClientTag.prefix" class="font-semibold mr-1">{{ titleWithClientTag.prefix }}</span>
        <span v-if="titleWithClientTag.prefix"> {{ titleWithClientTag.text }}</span>
        <span v-else>{{ titleWithClientTag.text }}</span>
      </p>
      <div
        v-if="todo.syncPending || todo.syncFailed || dueLabel || todo.clientTag || linkList.length || inlineTags.length"
        class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs"
      >
        <span
          v-if="todo.syncPending"
          class="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700"
          title="Waiting for cloud sync"
        >
          Syncing...
        </span>
        <span
          v-if="todo.syncFailed"
          class="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700"
          :title="todo.syncError || 'Cloud sync failed'"
        >
          Sync failed
        </span>
        <span
          v-if="dueLabel"
          class="rounded-full px-2 py-0.5"
          :class="isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'"
        >
          Due {{ dueLabel }}
        </span>
        <button
          v-if="todo.clientTag"
          type="button"
          :disabled="props.reorderMode"
          class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          @click.stop="selectClientTag(todo.clientTag)"
        >
          {{ todo.clientTag }}
        </button>
        <a
          v-if="primaryLink"
          :href="primaryLink"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100"
          :class="props.reorderMode ? 'pointer-events-none opacity-40' : ''"
          @click.stop
        >
          Open link
        </a>
        <span v-if="extraLinkCount" class="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
          +{{ extraLinkCount }} more
        </span>
        <button
          v-for="(tag, index) in inlineTags"
          :key="`${tag}-${index}`"
          type="button"
          :disabled="props.reorderMode"
          class="rounded-full px-2 py-0.5"
          :class="[
            tag.startsWith('@') ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700',
            { 'opacity-40': props.reorderMode }
          ]"
          @click.stop="selectInlineTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </div>
  </li>
</template>
