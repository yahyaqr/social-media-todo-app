<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Swiper, SwiperSlide } from 'swiper/vue';
import type { StageId, Todo } from '../data/stages';

type TaskUpdates = {
  text?: string;
  dueAt?: number;
  done?: boolean;
  clientTag?: string;
  links?: string[];
  linkCaptions?: string[];
  content?: string;
};

type ContentSegment = {
  text: string;
  bold: boolean;
  tagType?: 'mention' | 'topic';
};

type ContentLine = {
  kind: 'paragraph' | 'bullet' | 'checkbox';
  checked?: boolean;
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
const detailLinks = ref<string[]>([]);
const detailLinkCaptions = ref<string[]>([]);
const detailLinkInput = ref('');
const detailContent = ref('');
const detailContentInput = ref<HTMLTextAreaElement | null>(null);
const showContentPreview = ref(false);
const showClientTagSuggestions = ref(false);
const linkPasteHoldTimer = ref<number | null>(null);
const linkPasteLongPressTriggered = ref(false);
const activeLinkIndex = ref(0);
const linkSwiper = ref<any>(null);

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
  const splitTagSegments = (value: string, bold: boolean): ContentSegment[] => {
    const segments: ContentSegment[] = [];
    const tagPattern = /(@[A-Za-z0-9_]+|#[A-Za-z0-9_-]+)/g;
    let lastIndex = 0;

    for (const match of value.matchAll(tagPattern)) {
      const index = match.index ?? 0;
      if (index > lastIndex) {
        segments.push({
          text: value.slice(lastIndex, index),
          bold
        });
      }

      const tag = match[0];
      segments.push({
        text: tag,
        bold,
        tagType: tag.startsWith('@') ? 'mention' : 'topic'
      });

      lastIndex = index + tag.length;
    }

    if (lastIndex < value.length) {
      segments.push({
        text: value.slice(lastIndex),
        bold
      });
    }

    return segments;
  };

  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.flatMap((part) => {
    const isBold = /^\*\*[^*]+\*\*$/.test(part);
    const normalized = isBold ? part.slice(2, -2) : part;
    return splitTagSegments(normalized, isBold);
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
    detailLinks.value = [...(todo.links ?? [])];
    detailLinkCaptions.value = Array.from({ length: detailLinks.value.length }, (_, index) => {
      const value = todo.linkCaptions?.[index];
      return typeof value === 'string' ? value : '';
    });
    activeLinkIndex.value = 0;
    void nextTick(() => {
      linkSwiper.value?.slideTo(0, 0);
    });
    detailLinkInput.value = '';
    detailContent.value = todo.content ?? '';
    showContentPreview.value = false;
    showClientTagSuggestions.value = false;
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
    links: detailLinks.value,
    linkCaptions: detailLinkCaptions.value,
    content: normalizeBulletLines(detailContent.value)
  });
};

const toggleDone = (done: boolean): void => {
  emit('update', { done });
};

const filteredClientTags = computed(() => {
  const query = detailClientTag.value.trim().toLowerCase();
  if (!query) {
    return props.clientTags.slice(0, 8);
  }

  return props.clientTags.filter((tag) => tag.toLowerCase().includes(query)).slice(0, 8);
});

const onClientTagFocus = (): void => {
  showClientTagSuggestions.value = true;
};

const onClientTagBlur = (): void => {
  window.setTimeout(() => {
    showClientTagSuggestions.value = false;
  }, 120);
};

const onClientTagInput = (): void => {
  showClientTagSuggestions.value = true;
};

const selectClientTag = (tag: string): void => {
  detailClientTag.value = tag;
  showClientTagSuggestions.value = false;
  saveDetails();
};

const appendDetailLink = (): void => {
  const trimmed = detailLinkInput.value.trim();
  if (!trimmed || detailLinks.value.includes(trimmed)) {
    return;
  }

  detailLinks.value = [...detailLinks.value, trimmed];
  detailLinkCaptions.value = [...detailLinkCaptions.value, ''];
  activeLinkIndex.value = detailLinks.value.length - 1;
  void nextTick(() => {
    linkSwiper.value?.slideTo(activeLinkIndex.value, 0);
  });
  detailLinkInput.value = '';
  saveDetails();
};

const getInstagramEmbedUrl = (link: string): string | null => {
  const normalized = link.trim();
  const match = normalized.match(
    /^https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i
  );

  if (!match) {
    return null;
  }

  const postType = match[1].toLowerCase();
  const shortcode = match[2];
  return `https://www.instagram.com/${postType}/${shortcode}/embed/?omitscript=true`;
};

const pasteLinkFromClipboard = async (): Promise<void> => {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    return;
  }

  try {
    const clipboardText = (await navigator.clipboard.readText()).trim();
    if (clipboardText) {
      detailLinkInput.value = clipboardText;
    }
  } catch {
    // Ignore clipboard permission/runtime errors.
  }
};

const clearLinkPasteHoldTimer = (): void => {
  if (linkPasteHoldTimer.value !== null) {
    window.clearTimeout(linkPasteHoldTimer.value);
    linkPasteHoldTimer.value = null;
  }
};

const startLinkPasteHold = (): void => {
  clearLinkPasteHoldTimer();
  linkPasteLongPressTriggered.value = false;
  linkPasteHoldTimer.value = window.setTimeout(() => {
    linkPasteLongPressTriggered.value = true;
    void pasteLinkFromClipboard();
  }, 500);
};

const handleDetailAddLinkButtonClick = (): void => {
  if (linkPasteLongPressTriggered.value) {
    linkPasteLongPressTriggered.value = false;
    return;
  }

  appendDetailLink();
};

const closeDetails = (): void => {
  appendDetailLink();
  saveDetails();
  emit('close');
};

const removeDetailLink = (index: number): void => {
  detailLinks.value = detailLinks.value.filter((_, current) => current !== index);
  detailLinkCaptions.value = detailLinkCaptions.value.filter((_, current) => current !== index);
  if (!detailLinks.value.length) {
    activeLinkIndex.value = 0;
  } else if (activeLinkIndex.value >= detailLinks.value.length) {
    activeLinkIndex.value = detailLinks.value.length - 1;
  }
  void nextTick(() => {
    linkSwiper.value?.slideTo(activeLinkIndex.value, 0);
  });
  saveDetails();
};

const setDetailLinkCaption = (index: number, value: string): void => {
  if (index < 0 || index >= detailLinkCaptions.value.length) {
    return;
  }

  const next = [...detailLinkCaptions.value];
  next[index] = value;
  detailLinkCaptions.value = next;
};

const activeLink = computed(() => {
  if (!detailLinks.value.length) {
    return null;
  }

  const safeIndex = Math.min(activeLinkIndex.value, detailLinks.value.length - 1);
  const url = detailLinks.value[safeIndex];
  return {
    index: safeIndex,
    url,
    embedUrl: getInstagramEmbedUrl(url)
  };
});

const canGoToPreviousLink = computed(() => activeLinkIndex.value > 0);
const canGoToNextLink = computed(() => activeLinkIndex.value < detailLinks.value.length - 1);

const goToPreviousLink = (): void => {
  if (!canGoToPreviousLink.value) {
    return;
  }
  linkSwiper.value?.slidePrev();
};

const goToNextLink = (): void => {
  if (!canGoToNextLink.value) {
    return;
  }
  linkSwiper.value?.slideNext();
};

const goToLinkAt = (index: number): void => {
  if (index < 0 || index >= detailLinks.value.length) {
    return;
  }
  linkSwiper.value?.slideTo(index);
};

const onLinkSwiperInit = (swiper: any): void => {
  linkSwiper.value = swiper;
  activeLinkIndex.value = swiper.activeIndex ?? 0;
};

const onLinkSwiperSlideChange = (swiper: any): void => {
  activeLinkIndex.value = swiper.activeIndex ?? 0;
};

const confirmDelete = (): void => {
  const shouldDelete = window.confirm(
    'This action will permanently delete this task. Are you sure you want to continue?'
  );

  if (!shouldDelete) {
    return;
  }

  emit('delete');
};

const onContentInput = (): void => {
  const normalized = normalizeBulletLines(detailContent.value);
  if (normalized !== detailContent.value) {
    detailContent.value = normalized;
  }
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

const insertCheckboxAtCaret = (): void => {
  const input = detailContentInput.value;
  if (!input) {
    return;
  }

  const start = input.selectionStart;
  const end = input.selectionEnd;
  const before = detailContent.value.slice(0, start);
  const after = detailContent.value.slice(end);
  const prefix = start === 0 || detailContent.value[start - 1] === '\n' ? '- [ ] ' : '\n- [ ] ';

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
    const checkboxMatch = line.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      return {
        kind: 'checkbox',
        checked,
        segments: splitBoldSegments(checkboxMatch[2])
      };
    }

    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    const text = bulletMatch ? bulletMatch[1] : line;
    return {
      kind: bulletMatch ? 'bullet' : 'paragraph',
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
          class="inline-flex h-9 w-24 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="Back"
          title="Back"
          @click="closeDetails"
        >
          <svg viewBox="0 0 32 24" class="h-4 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M30 12H2M9 19l-7-7 7-7" />
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
            <div class="relative">
              <input
                v-model="detailClientTag"
                type="text"
                placeholder="Client tag"
                class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
                aria-label="Client tag"
                @focus="onClientTagFocus"
                @blur="onClientTagBlur"
                @input="onClientTagInput"
                @change="saveDetails"
              />
              <div
                v-if="showClientTagSuggestions && filteredClientTags.length"
                class="suggestion-scrollbar absolute left-0 right-0 top-full z-30 mt-1 max-h-28 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
              >
                <button
                  v-for="tag in filteredClientTags"
                  :key="tag"
                  type="button"
                  class="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  :class="{ 'bg-blue-50 text-blue-700': detailClientTag === tag }"
                  @mousedown.prevent="selectClientTag(tag)"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
            <div class="space-y-2 md:col-span-2">
              <div class="flex gap-2">
                <input
                  v-model="detailLinkInput"
                  type="url"
                  placeholder="Add link"
                  class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
                  aria-label="Task link"
                  @keydown.enter.prevent="appendDetailLink"
                  @blur="appendDetailLink"
                />
                <button
                  type="button"
                  class="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 px-3 text-slate-700 hover:bg-slate-100"
                  aria-label="Add link"
                  title="Add link"
                  @click="handleDetailAddLinkButtonClick"
                  @mousedown="startLinkPasteHold"
                  @mouseup="clearLinkPasteHoldTimer"
                  @mouseleave="clearLinkPasteHoldTimer"
                  @touchstart="startLinkPasteHold"
                  @touchend="clearLinkPasteHoldTimer"
                  @touchcancel="clearLinkPasteHoldTimer"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              </div>

              <div v-if="activeLink" class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div class="relative rounded-lg border border-slate-200 bg-white p-2">
                  <Swiper
                    class="link-preview-swiper"
                    :slides-per-view="1"
                    :space-between="8"
                    :allow-touch-move="detailLinks.length > 1"
                    :nested="true"
                    @swiper="onLinkSwiperInit"
                    @slideChange="onLinkSwiperSlideChange"
                  >
                    <SwiperSlide v-for="(item, index) in detailLinks" :key="`${item}-${index}`">
                      <div class="mb-2 flex items-center justify-between gap-2 text-xs text-slate-700">
                        <a
                          :href="item"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="truncate text-blue-700 hover:underline"
                        >
                          {{ item }}
                        </a>
                        <button
                          type="button"
                          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Remove link"
                          title="Remove link"
                          @click="removeDetailLink(index)"
                        >
                          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <iframe
                        v-if="getInstagramEmbedUrl(item)"
                        :src="getInstagramEmbedUrl(item) as string"
                        class="h-[430px] w-full rounded-lg border border-slate-200 bg-white"
                        loading="lazy"
                        scrolling="no"
                        frameborder="0"
                        allowfullscreen
                        title="Instagram preview"
                      />
                      <div
                        v-else
                        class="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500"
                      >
                        Preview available for Instagram post links.
                      </div>
                      <input
                        :value="detailLinkCaptions[index] ?? ''"
                        type="text"
                        placeholder="Add note..."
                        class="mt-2 min-h-10 w-full rounded-lg border border-slate-100 bg-slate-100/90 px-3 py-2 text-xs text-slate-600 placeholder:text-slate-400 outline-none"
                        @input="setDetailLinkCaption(index, ($event.target as HTMLInputElement).value)"
                        @blur="saveDetails"
                      />
                    </SwiperSlide>
                  </Swiper>

                  <button
                    v-if="detailLinks.length > 1"
                    type="button"
                    class="absolute left-0 top-0 z-20 inline-flex h-full w-14 items-center justify-center bg-gradient-to-r from-white/95 via-white/70 to-transparent text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous link"
                    :disabled="!canGoToPreviousLink"
                    @click="goToPreviousLink"
                  >
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    v-if="detailLinks.length > 1"
                    type="button"
                    class="absolute right-0 top-0 z-20 inline-flex h-full w-14 items-center justify-center bg-gradient-to-l from-white/95 via-white/70 to-transparent text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next link"
                    :disabled="!canGoToNextLink"
                    @click="goToNextLink"
                  >
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>

                <div v-if="detailLinks.length > 1" class="flex items-center justify-center gap-1.5 pb-1">
                  <button
                    v-for="(_, index) in detailLinks"
                    :key="`link-indicator-${index}`"
                    type="button"
                    class="h-1.5 rounded-full transition-all"
                    :class="index === activeLinkIndex ? 'w-4 bg-slate-700' : 'w-1.5 bg-slate-300 hover:bg-slate-400'"
                    :aria-label="`Go to link ${index + 1}`"
                    @click="goToLinkAt(index)"
                  />
                </div>
              </div>
            </div>
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
                  title="Insert checkbox"
                  aria-label="Insert checkbox"
                  @click="insertCheckboxAtCaret"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M8 12l3 3 5-6" />
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
              placeholder="Write notes. Use - [ ] for checkbox, @name for mention, #topic for tag, - for bullets, and **bold** or Ctrl/Cmd+B."
              @input="onContentInput"
              @keydown="onContentKeydown"
              @blur="saveDetails"
            />

            <div v-if="showContentPreview" class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Formatted Preview</p>
              <div v-if="contentPreview.length" class="space-y-1 text-sm text-slate-800">
                <div
                  v-for="(line, index) in contentPreview"
                  :key="index"
                  class="flex items-start gap-2"
                  :class="{ 'pl-0': line.kind === 'paragraph' }"
                >
                  <span v-if="line.kind === 'bullet'" class="mt-[1px] text-slate-500">&bull;</span>
                  <span
                    v-if="line.kind === 'checkbox'"
                    class="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    :class="
                      line.checked
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-400 bg-white text-transparent'
                    "
                  >
                    <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <span :class="{ 'text-slate-500 line-through': line.kind === 'checkbox' && line.checked }">
                    <template v-for="(segment, segmentIndex) in line.segments" :key="`${index}-${segmentIndex}`">
                      <strong
                        v-if="segment.bold"
                        :class="{
                          'rounded bg-sky-100 px-1 py-0.5 text-sky-700': segment.tagType === 'mention',
                          'rounded bg-emerald-100 px-1 py-0.5 text-emerald-700': segment.tagType === 'topic'
                        }"
                      >
                        {{ segment.text }}
                      </strong>
                      <span
                        v-else
                        :class="{
                          'rounded bg-sky-100 px-1 py-0.5 text-sky-700': segment.tagType === 'mention',
                          'rounded bg-emerald-100 px-1 py-0.5 text-emerald-700': segment.tagType === 'topic'
                        }"
                      >
                        {{ segment.text }}
                      </span>
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
                @click="confirmDelete"
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
