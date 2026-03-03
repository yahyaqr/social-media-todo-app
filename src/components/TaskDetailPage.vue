<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { stages, type StageId, type Todo } from '../data/stages';
import { useTodosStore } from '../stores/todos';
import FullContentEditor from './FullContentEditor.vue';

const route = useRoute();
const router = useRouter();
const store = useTodosStore();

const detailTitle = ref('');
const detailDueDate = ref('');
const detailClientTag = ref('');
const detailLinks = ref<string[]>([]);
const detailLinkCaptions = ref<string[]>([]);
const detailLinkInput = ref('');
const detailContent = ref('');
const showClientTagSuggestions = ref(false);
const activeLinkIndex = ref(0);
const linkSwiper = ref<any>(null);
const linkCaptionTextareaRefs = ref<Record<number, HTMLTextAreaElement | null>>({});

const isStageId = (value: string): value is StageId =>
  value === 'ideation' || value === 'research' || value === 'draft' || value === 'produce' || value === 'publish';

const stageId = computed<StageId | null>(() => {
  const value = String(route.params.stageId ?? '');
  return isStageId(value) ? value : null;
});

const todoId = computed(() => String(route.params.todoId ?? ''));

const todo = computed<Todo | null>(() => {
  if (!stageId.value || !todoId.value) {
    return null;
  }

  return store.todosByStage[stageId.value].find((item) => item.id === todoId.value) ?? null;
});

const currentStageIndex = computed(() => stages.findIndex((stage) => stage.id === stageId.value));
const canUndo = computed(() => currentStageIndex.value > 0);
const canAdvance = computed(() => currentStageIndex.value >= 0 && currentStageIndex.value < stages.length - 1);

const autoResizeTextarea = (textarea: HTMLTextAreaElement): void => {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const setLinkCaptionTextareaRef = (index: number, element: unknown): void => {
  if (element instanceof HTMLTextAreaElement) {
    linkCaptionTextareaRefs.value[index] = element;
    autoResizeTextarea(element);
    return;
  }

  delete linkCaptionTextareaRefs.value[index];
};

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

const hydrateFromTodo = (value: Todo): void => {
  detailTitle.value = value.text;
  detailDueDate.value = formatDateInput(value.dueAt);
  detailClientTag.value = value.clientTag ?? '';
  detailLinks.value = [...(value.links ?? [])];
  detailLinkCaptions.value = Array.from({ length: detailLinks.value.length }, (_, index) => {
    const caption = value.linkCaptions?.[index];
    return typeof caption === 'string' ? caption : '';
  });
  activeLinkIndex.value = 0;
  void nextTick(() => {
    linkSwiper.value?.slideTo(0, 0);
  });
  detailLinkInput.value = '';
  detailContent.value = value.content ?? '';
  showClientTagSuggestions.value = false;
  void nextTick(() => {
    for (const textarea of Object.values(linkCaptionTextareaRefs.value)) {
      if (textarea) {
        autoResizeTextarea(textarea);
      }
    }
  });
};

watch(
  () => todo.value?.id,
  (id, previousId) => {
    if (!todo.value || !id) {
      return;
    }

    if (!previousId || id !== previousId) {
      hydrateFromTodo(todo.value);
    }
  },
  { immediate: true }
);

const goBack = (): void => {
  if (window.history.length > 1) {
    void router.back();
    return;
  }

  void router.replace({ name: 'home' });
};

const saveDetails = (): void => {
  if (!todo.value || !stageId.value) {
    return;
  }

  const trimmedTitle = detailTitle.value.trim();
  if (!trimmedTitle) {
    return;
  }

  store.updateTodo(stageId.value, todo.value.id, {
    text: trimmedTitle,
    dueAt: parseDate(detailDueDate.value),
    clientTag: detailClientTag.value,
    links: detailLinks.value,
    linkCaptions: detailLinkCaptions.value,
    content: detailContent.value
  });
};

const toggleDone = (done: boolean): void => {
  if (!todo.value || !stageId.value) {
    return;
  }

  store.updateTodo(stageId.value, todo.value.id, { done });
};

const filteredClientTags = computed(() => {
  const query = detailClientTag.value.trim().toLowerCase();
  if (!query) {
    return store.clientTags.slice(0, 8);
  }

  return store.clientTags.filter((tag) => tag.toLowerCase().includes(query)).slice(0, 8);
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

const removeDetailLink = (index: number): void => {
  const shouldRemove = window.confirm('Remove this link from the task?');
  if (!shouldRemove) {
    return;
  }

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

const onDetailLinkCaptionInput = (index: number, event: Event): void => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }

  setDetailLinkCaption(index, target.value);
  autoResizeTextarea(target);
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
  if (!todo.value || !stageId.value) {
    return;
  }

  const shouldDelete = window.confirm(
    'This action will permanently delete this task. Are you sure you want to continue?'
  );

  if (!shouldDelete) {
    return;
  }

  store.deleteTodo(stageId.value, todo.value.id);
  void router.replace({ name: 'home' });
};

const moveTodo = (direction: -1 | 1): void => {
  if (!todo.value || !stageId.value) {
    return;
  }

  const nextIndex = currentStageIndex.value + direction;
  if (nextIndex < 0 || nextIndex >= stages.length) {
    return;
  }

  const targetStageId = stages[nextIndex].id;
  const moved = store.moveTodoToStage(stageId.value, todo.value.id, targetStageId);
  if (moved) {
    void router.replace({ name: 'task-detail', params: { stageId: targetStageId, todoId: todo.value.id } });
  }
};

const createdLabel = computed(() => {
  if (!todo.value) {
    return '';
  }
  return new Date(todo.value.createdAt).toLocaleString();
});
</script>

<template>
  <main class="h-[100dvh] bg-slate-100 md:p-8">
    <div v-if="!todo || !stageId" class="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <p class="text-sm text-slate-600">Task not found.</p>
      <button
        type="button"
        class="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        @click="goBack"
      >
        Back
      </button>
    </div>

    <div v-else class="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl ring-1 ring-slate-200 md:rounded-2xl">
      <div class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
        <button
          type="button"
          class="inline-flex h-9 w-24 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="Back"
          title="Back"
          @click="goBack"
        >
          <svg viewBox="0 0 32 24" class="h-4 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M30 12H2M9 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="flex items-center gap-2 sm:gap-3">
          <p class="text-[11px] font-medium text-slate-500 sm:text-xs">
            Created {{ createdLabel }}
          </p>
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
                <div class="relative w-full">
                  <input
                    v-model="detailLinkInput"
                    type="url"
                    placeholder="Add link"
                    class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none ring-blue-300 focus:ring-2"
                    aria-label="Task link"
                    @keydown.enter.prevent="appendDetailLink"
                    @blur="appendDetailLink"
                  />
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 inline-flex h-8 w-12 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-300/70 bg-white/70 text-slate-600 backdrop-blur-sm hover:bg-white/90"
                    aria-label="Paste link"
                    title="Paste link"
                    @click="pasteLinkFromClipboard"
                  >
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  class="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 px-3 text-slate-700 hover:bg-slate-100"
                  aria-label="Add link"
                  title="Add link"
                  @click="appendDetailLink"
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
                      <div class="relative">
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
                        <button
                          v-if="detailLinks.length > 1"
                          type="button"
                          class="absolute left-0 top-0 z-20 inline-flex h-full w-14 items-center justify-center rounded-l-lg bg-gradient-to-r from-white/95 via-white/70 to-transparent text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                          class="absolute right-0 top-0 z-20 inline-flex h-full w-14 items-center justify-center rounded-r-lg bg-gradient-to-l from-white/95 via-white/70 to-transparent text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Next link"
                          :disabled="!canGoToNextLink"
                          @click="goToNextLink"
                        >
                          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </button>
                      </div>
                      <textarea
                        :ref="(el) => setLinkCaptionTextareaRef(index, el)"
                        :value="detailLinkCaptions[index] ?? ''"
                        rows="1"
                        placeholder="Add note..."
                        class="mt-2 w-full resize-none overflow-hidden rounded-lg border border-slate-100 bg-slate-100/90 px-3 py-2 text-xs text-slate-600 placeholder:text-slate-400 outline-none"
                        @input="onDetailLinkCaptionInput(index, $event)"
                        @blur="saveDetails"
                      />
                    </SwiperSlide>
                  </Swiper>
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

          <div class="mt-5">
            <FullContentEditor
              v-model="detailContent"
              placeholder="Write notes... Tag people with @mention and topics with #tag."
              @blur="saveDetails"
              @commit="saveDetails"
            />

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
                  @click="moveTodo(-1)"
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
                  @click="moveTodo(1)"
                >
                  Advance →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
