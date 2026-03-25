<script setup lang="ts">
import { Pause, Play, X } from 'lucide-vue-next';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  contentHtml: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 420;
const DEFAULT_FONT_SIZE = 28;
const DEFAULT_SPEED = 36;
const FONT_STEP = 2;
const SPEED_STEP = 8;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ResizeState = {
  pointerId: number;
  startX: number;
  startY: number;
  directionX: -1 | 0 | 1;
  directionY: -1 | 0 | 1;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
};

const panelX = ref(48);
const panelY = ref(48);
const panelWidth = ref(DEFAULT_WIDTH);
const panelHeight = ref(DEFAULT_HEIGHT);
const fontSize = ref(DEFAULT_FONT_SIZE);
const scrollSpeed = ref(DEFAULT_SPEED);
const isAutoScrolling = ref(false);
const scrollTop = ref(0);
const scrollPosition = ref(0);

const panelBody = ref<HTMLElement | null>(null);
const dragState = ref<DragState | null>(null);
const resizeState = ref<ResizeState | null>(null);

let animationFrameId = 0;
let lastFrameTime = 0;

const safeContentHtml = computed(() => props.contentHtml || '<p></p>');

const getViewportWidth = (): number => window.innerWidth;
const getViewportHeight = (): number => window.innerHeight;

const getMaxPanelWidth = (): number => Math.max(MIN_WIDTH, getViewportWidth() - 24);
const getMaxPanelHeight = (): number => Math.max(MIN_HEIGHT, getViewportHeight() - 24);

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const clampPanelPosition = (): void => {
  const maxX = Math.max(12, getViewportWidth() - panelWidth.value - 12);
  const maxY = Math.max(12, getViewportHeight() - panelHeight.value - 12);

  panelX.value = clamp(panelX.value, 12, maxX);
  panelY.value = clamp(panelY.value, 12, maxY);
};

const applyViewportBounds = (): void => {
  panelWidth.value = clamp(panelWidth.value, MIN_WIDTH, getMaxPanelWidth());
  panelHeight.value = clamp(panelHeight.value, MIN_HEIGHT, getMaxPanelHeight());
  clampPanelPosition();
};

const resetPanelLayout = (): void => {
  panelWidth.value = Math.min(DEFAULT_WIDTH, getMaxPanelWidth());
  panelHeight.value = Math.min(DEFAULT_HEIGHT, getMaxPanelHeight());
  panelX.value = clamp(48, 12, Math.max(12, getViewportWidth() - panelWidth.value - 12));
  panelY.value = clamp(48, 12, Math.max(12, getViewportHeight() - panelHeight.value - 12));
};

const cancelAutoScroll = (): void => {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }
  lastFrameTime = 0;
};

const stopAutoScroll = (): void => {
  isAutoScrolling.value = false;
  cancelAutoScroll();
};

const tickAutoScroll = (timestamp: number): void => {
  if (!isAutoScrolling.value || !panelBody.value) {
    cancelAutoScroll();
    return;
  }

  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const elapsedMs = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  const maxScrollTop = Math.max(0, panelBody.value.scrollHeight - panelBody.value.clientHeight);
  const nextScrollTop = Math.min(
    maxScrollTop,
    scrollPosition.value + (scrollSpeed.value * elapsedMs) / 1000
  );

  scrollPosition.value = nextScrollTop;
  panelBody.value.scrollTop = nextScrollTop;
  scrollTop.value = nextScrollTop;

  if (nextScrollTop >= maxScrollTop) {
    stopAutoScroll();
    return;
  }

  animationFrameId = window.requestAnimationFrame(tickAutoScroll);
};

const startAutoScroll = (): void => {
  if (!panelBody.value) {
    return;
  }

  const maxScrollTop = Math.max(0, panelBody.value.scrollHeight - panelBody.value.clientHeight);

  if (panelBody.value.scrollTop >= maxScrollTop) {
    panelBody.value.scrollTop = 0;
    scrollTop.value = 0;
    scrollPosition.value = 0;
  }

  cancelAutoScroll();
  scrollPosition.value = panelBody.value.scrollTop;
  isAutoScrolling.value = true;
  animationFrameId = window.requestAnimationFrame(tickAutoScroll);
};

const toggleAutoScroll = (): void => {
  if (isAutoScrolling.value) {
    stopAutoScroll();
    return;
  }

  startAutoScroll();
};

const handleBodyScroll = (): void => {
  if (!panelBody.value) {
    return;
  }

  scrollTop.value = panelBody.value.scrollTop;
  scrollPosition.value = panelBody.value.scrollTop;
};

const syncScrollPosition = (): void => {
  if (!panelBody.value) {
    return;
  }

  scrollPosition.value = scrollTop.value;
  panelBody.value.scrollTop = scrollTop.value;
};

const adjustFontSize = (direction: -1 | 1): void => {
  fontSize.value = clamp(fontSize.value + direction * FONT_STEP, 18, 56);
};

const adjustScrollSpeed = (direction: -1 | 1): void => {
  scrollSpeed.value = clamp(scrollSpeed.value + direction * SPEED_STEP, 8, 160);
};

const onDragPointerDown = (event: PointerEvent): void => {
  if (event.button !== 0) {
    return;
  }

  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: panelX.value,
    originY: panelY.value
  };

  event.preventDefault();
};

const onResizePointerDown = (
  event: PointerEvent,
  directionX: -1 | 0 | 1,
  directionY: -1 | 0 | 1
): void => {
  if (event.button !== 0) {
    return;
  }

  resizeState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    directionX,
    directionY,
    originX: panelX.value,
    originY: panelY.value,
    originWidth: panelWidth.value,
    originHeight: panelHeight.value
  };

  event.preventDefault();
};

const handlePointerMove = (event: PointerEvent): void => {
  if (dragState.value && dragState.value.pointerId === event.pointerId) {
    panelX.value = dragState.value.originX + (event.clientX - dragState.value.startX);
    panelY.value = dragState.value.originY + (event.clientY - dragState.value.startY);
    clampPanelPosition();
  }

  if (resizeState.value && resizeState.value.pointerId === event.pointerId) {
    const deltaX = event.clientX - resizeState.value.startX;
    const deltaY = event.clientY - resizeState.value.startY;

    if (resizeState.value.directionX !== 0) {
      if (resizeState.value.directionX === 1) {
        panelWidth.value = clamp(
          resizeState.value.originWidth + deltaX,
          MIN_WIDTH,
          getViewportWidth() - resizeState.value.originX - 12
        );
        panelX.value = resizeState.value.originX;
      } else {
        const nextWidth = clamp(
          resizeState.value.originWidth - deltaX,
          MIN_WIDTH,
          resizeState.value.originWidth + resizeState.value.originX - 12
        );

        panelWidth.value = nextWidth;
        panelX.value = resizeState.value.originX + (resizeState.value.originWidth - nextWidth);
      }
    }

    if (resizeState.value.directionY !== 0) {
      if (resizeState.value.directionY === 1) {
        panelHeight.value = clamp(
          resizeState.value.originHeight + deltaY,
          MIN_HEIGHT,
          getViewportHeight() - resizeState.value.originY - 12
        );
        panelY.value = resizeState.value.originY;
      } else {
        const nextHeight = clamp(
          resizeState.value.originHeight - deltaY,
          MIN_HEIGHT,
          resizeState.value.originHeight + resizeState.value.originY - 12
        );

        panelHeight.value = nextHeight;
        panelY.value = resizeState.value.originY + (resizeState.value.originHeight - nextHeight);
      }
    }

    applyViewportBounds();
  }
};

const handlePointerUp = (event: PointerEvent): void => {
  if (dragState.value?.pointerId === event.pointerId) {
    dragState.value = null;
  }

  if (resizeState.value?.pointerId === event.pointerId) {
    resizeState.value = null;
  }
};

const onWindowResize = (): void => {
  applyViewportBounds();
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetPanelLayout();
      stopAutoScroll();
      scrollTop.value = 0;
      scrollPosition.value = 0;

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
      window.addEventListener('resize', onWindowResize);
      return;
    }

    dragState.value = null;
    resizeState.value = null;
    stopAutoScroll();

    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
    window.removeEventListener('resize', onWindowResize);
  }
);

watch(panelBody, () => {
  syncScrollPosition();
});

watch(
  () => props.contentHtml,
  () => {
    stopAutoScroll();
    scrollTop.value = 0;
    scrollPosition.value = 0;
    syncScrollPosition();
  }
);

onBeforeUnmount(() => {
  stopAutoScroll();
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
  window.removeEventListener('pointercancel', handlePointerUp);
  window.removeEventListener('resize', onWindowResize);
});
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[80] pointer-events-auto"
  >
    <div
      class="absolute inset-0 bg-black/80"
      @click="emit('close')"
    />

    <section
      role="dialog"
      aria-modal="false"
      aria-label="Teleprompter"
      class="fixed pointer-events-auto flex flex-col overflow-hidden rounded-md border border-slate-400/55 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[0_22px_60px_rgba(15,23,42,0.35)]"
      :style="{
        left: `${panelX}px`,
        top: `${panelY}px`,
        width: `${panelWidth}px`,
        height: `${panelHeight}px`
      }"
    >
      <header
        class="flex cursor-grab select-none items-center justify-center border-b border-slate-400/20 bg-slate-900/92 px-4 py-3 touch-none max-sm:px-3.5"
        @pointerdown="onDragPointerDown"
      >
        <div
          aria-hidden="true"
          class="h-1.5 w-16 rounded-full bg-slate-500/65 shadow-[0_0_0_1px_rgba(148,163,184,0.12)]"
        />
      </header>

      <div
        ref="panelBody"
        class="teleprompter-scrollbar flex-1 overflow-y-auto px-6 pb-8 pt-6 text-slate-50 [line-height:1.7] overscroll-contain max-sm:px-3.5"
        :style="{ fontSize: `${fontSize}px` }"
        @scroll="handleBodyScroll"
      >
        <div class="teleprompter-content" v-html="safeContentHtml" />
      </div>

      <div class="flex items-center justify-between gap-2 border-b border-slate-400/20 bg-slate-900/80 px-3 py-2 max-sm:px-2.5">
        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="inline-flex min-h-8 min-w-[1.9rem] items-center justify-center rounded-[0.625rem] border border-blue-400/40 bg-slate-800/95 px-2 py-1 text-xs font-semibold text-slate-50 transition hover:bg-blue-600/75"
            @click="adjustFontSize(-1)"
          >
            A-
          </button>
          <span class="min-w-[1.6rem] text-center text-xs tabular-nums text-blue-200">
            {{ fontSize }}
          </span>
          <button
            type="button"
            class="inline-flex min-h-8 min-w-[1.9rem] items-center justify-center rounded-[0.625rem] border border-blue-400/40 bg-slate-800/95 px-2 py-1 text-xs font-semibold text-slate-50 transition hover:bg-blue-600/75"
            @click="adjustFontSize(1)"
          >
            A+
          </button>
        </div>

        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="inline-flex min-h-8 min-w-[1.9rem] items-center justify-center rounded-[0.625rem] border border-blue-400/40 bg-slate-800/95 px-2 py-1 text-xs font-semibold text-slate-50 transition hover:bg-blue-600/75"
            @click="adjustScrollSpeed(-1)"
          >
            -
          </button>
          <span class="min-w-[1.6rem] text-center text-xs tabular-nums text-blue-200">
            {{ scrollSpeed }}
          </span>
          <button
            type="button"
            class="inline-flex min-h-8 min-w-[1.9rem] items-center justify-center rounded-[0.625rem] border border-blue-400/40 bg-slate-800/95 px-2 py-1 text-xs font-semibold text-slate-50 transition hover:bg-blue-600/75"
            @click="adjustScrollSpeed(1)"
          >
            +
          </button>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex min-h-8 min-w-[1.9rem] items-center justify-center rounded-[0.625rem] border border-blue-400/40 bg-slate-800/95 px-2 py-1 text-slate-50 transition hover:bg-blue-600/75"
            :aria-label="isAutoScrolling ? 'Pause auto-scroll' : 'Start auto-scroll'"
            :title="isAutoScrolling ? 'Pause auto-scroll' : 'Start auto-scroll'"
            @click="toggleAutoScroll"
          >
            <Pause v-if="isAutoScrolling" class="h-4 w-4" />
            <Play v-else class="h-4 w-4" />
          </button>

          <button
            type="button"
            class="inline-flex min-h-8 min-w-[1.9rem] items-center justify-center rounded-[0.625rem] border border-blue-400/40 bg-slate-800/95 px-2 py-1 text-slate-50 transition hover:bg-blue-600/75"
            aria-label="Close teleprompter"
            title="Close teleprompter"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Resize teleprompter height from top"
        title="Resize height"
        class="absolute left-4 right-4 top-0 h-4 cursor-ns-resize border-0 bg-transparent touch-none"
        @pointerdown="onResizePointerDown($event, 0, -1)"
      />

      <button
        type="button"
        aria-label="Resize teleprompter width from right"
        title="Resize width"
        class="absolute bottom-8 right-0 top-4 w-5 cursor-ew-resize border-0 bg-transparent touch-none after:absolute after:bottom-5 after:left-1/2 after:top-5 after:w-1 after:-translate-x-1/2 after:bg-blue-100/5"
        @pointerdown="onResizePointerDown($event, 1, 0)"
      />

      <button
        type="button"
        aria-label="Resize teleprompter height from bottom"
        title="Resize height"
        class="absolute bottom-0 left-4 right-4 h-4 cursor-ns-resize border-0 bg-transparent touch-none"
        @pointerdown="onResizePointerDown($event, 0, 1)"
      />

      <button
        type="button"
        aria-label="Resize teleprompter width from left"
        title="Resize width"
        class="absolute bottom-8 left-0 top-4 w-5 cursor-ew-resize border-0 bg-transparent touch-none after:absolute after:bottom-5 after:left-1/2 after:top-5 after:w-1 after:-translate-x-1/2 after:bg-blue-100/5"
        @pointerdown="onResizePointerDown($event, -1, 0)"
      />
    </section>
  </div>
</template>

<style scoped>
.teleprompter-scrollbar {
  scrollbar-width: none;
  scrollbar-color: rgb(96 165 250) rgb(15 23 42 / 0.65);
}

.teleprompter-scrollbar::-webkit-scrollbar {
  width: 12px;
}

.teleprompter-scrollbar::-webkit-scrollbar-track {
  background: rgb(15 23 42 / 0.65);
  border-radius: 9999px;
}

.teleprompter-scrollbar::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgb(96 165 250), rgb(59 130 246));
  border-radius: 9999px;
  border: 2px solid rgb(15 23 42 / 0.65);
}

.teleprompter-scrollbar::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgb(147 197 253), rgb(96 165 250));
}

.teleprompter-content :deep(*) {
  max-width: 100%;
}

.teleprompter-content :deep(a) {
  color: rgb(147 197 253);
  text-decoration: underline;
  pointer-events: none;
}

.teleprompter-content :deep(p) {
  margin: 0;
}

.teleprompter-content :deep(p + p) {
  margin-top: 1.1em;
}

.teleprompter-content :deep(ul),
.teleprompter-content :deep(ol) {
  margin: 0.45em 0;
  padding-left: 1.35em;
}

.teleprompter-content :deep(li + li) {
  margin-top: 0.2em;
}

.teleprompter-content :deep(blockquote) {
  margin: 0.8em 0;
  padding-left: 0.75em;
  border-left: 3px solid rgb(96 165 250 / 0.55);
  color: rgb(191 219 254);
}

.teleprompter-content :deep(code) {
  padding: 0.08em 0.28em;
  border-radius: 0.3rem;
  background: rgb(30 41 59);
  font-size: 0.85em;
}

.teleprompter-content :deep(pre) {
  overflow-x: auto;
  margin: 0.8em 0;
  padding: 0.9em 1em;
  border-radius: 0.75rem;
  background: rgb(15 23 42);
  border: 1px solid rgb(148 163 184 / 0.16);
  font-size: 0.75em;
}

.teleprompter-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.teleprompter-content :deep(hr) {
  margin: 1em 0;
  border: 0;
  border-top: 1px solid rgb(148 163 184 / 0.25);
}
</style>
