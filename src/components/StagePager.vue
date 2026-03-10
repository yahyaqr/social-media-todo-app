<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { stages, type StageId } from '../data/stages';
import { getDefaultClientTagFromFilter, loadPersistedFilters } from '../lib/taskFilters';
import { useAuthStore } from '../stores/auth';
import { useTodosStore } from '../stores/todos';
import AddTaskSheet from './AddTaskSheet.vue';
import CalendarPage from './CalendarPage.vue';
import StagePage from './StagePage.vue';

import 'swiper/css';

const store = useTodosStore();
const authStore = useAuthStore();
const router = useRouter();

const isAddTaskSheetOpen = ref(false);
const isProfileOpen = ref(false);
const LEGACY_STAGE_INDEX_STORAGE_KEY = 'social-todo:active-stage-index';
const SLIDE_INDEX_STORAGE_KEY = 'social-todo:active-slide-index';
const CALENDAR_SLIDE_INDEX = 0;
const FIRST_STAGE_SLIDE_INDEX = 1;

const getTodayStageIndex = (): number => {
  const today = new Date().getDay();

  if (today >= 1 && today <= 5) {
    return today - 1;
  }

  return 0;
};

const todayStageIndex = computed(() => getTodayStageIndex());

const readStoredIndex = (storageKey: string, maxExclusive: number): number | null => {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === null) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= maxExclusive) {
    return null;
  }

  return parsed;
};

const getStoredSlideIndex = (): number | null => {
  const current = readStoredIndex(SLIDE_INDEX_STORAGE_KEY, stages.length + FIRST_STAGE_SLIDE_INDEX);
  if (current !== null) {
    return current;
  }

  const legacyStageIndex = readStoredIndex(LEGACY_STAGE_INDEX_STORAGE_KEY, stages.length);
  if (legacyStageIndex !== null) {
    return legacyStageIndex + FIRST_STAGE_SLIDE_INDEX;
  }

  return null;
};

const activeSlideIndex = ref(getStoredSlideIndex() ?? todayStageIndex.value + FIRST_STAGE_SLIDE_INDEX);
const activeStageIndex = computed(() => Math.max(0, activeSlideIndex.value - FIRST_STAGE_SLIDE_INDEX));
const isCalendarSlideActive = computed(() => activeSlideIndex.value === CALENDAR_SLIDE_INDEX);

const activeStageId = computed<StageId>(() => {
  const stage = stages[activeStageIndex.value];
  return stage?.id ?? stages[0].id;
});
const defaultClientTagForNewTask = computed(() =>
  getDefaultClientTagFromFilter(loadPersistedFilters(activeStageId.value).clientTagFilter)
);

const canCreateTask = computed(() => store.cloudReady);

const formatDateInput = (timestamp: number): string => {
  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const stageWeekday: Record<StageId, number> = {
  ideation: 1,
  research: 2,
  draft: 3,
  produce: 4,
  publish: 5
};

const getNextStageDate = (stageId: StageId): string => {
  const now = new Date();
  const targetWeekday = stageWeekday[stageId];
  const dayOffset = (targetWeekday - now.getDay() + 7) % 7;
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  return formatDateInput(targetDate.getTime());
};

const parseDate = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const syncActiveStageIndex = (swiper: { activeIndex?: number; realIndex?: number }): void => {
  activeSlideIndex.value = swiper.realIndex ?? swiper.activeIndex ?? FIRST_STAGE_SLIDE_INDEX;
  window.localStorage.setItem(SLIDE_INDEX_STORAGE_KEY, String(activeSlideIndex.value));
};

const openAddTaskSheet = (): void => {
  if (!canCreateTask.value) {
    return;
  }

  isAddTaskSheetOpen.value = true;
};

const closeAddTaskSheet = (): void => {
  isAddTaskSheetOpen.value = false;
};

const submitFromSheet = (payload: {
  text: string;
  dueDate: string;
  clientTag: string;
  links: string[];
}): void => {
  if (!canCreateTask.value) {
    return;
  }

  store.addTodo(activeStageId.value, payload.text, parseDate(payload.dueDate), payload.clientTag, payload.links);
};

const toggleProfile = (): void => {
  isProfileOpen.value = !isProfileOpen.value;
};

const closeProfile = (): void => {
  isProfileOpen.value = false;
};

const goToContentIdeation = async (): Promise<void> => {
  closeProfile();
  await router.push({ name: 'content-ideation' });
};

const signOut = async (): Promise<void> => {
  try {
    await authStore.signOutCurrentUser();
    closeProfile();
  } catch {
    // App auth state will surface errors in the auth screen.
  }
};
</script>

<template>
  <div class="relative h-full">
    <Swiper
      :slides-per-view="1"
      :space-between="0"
      :initial-slide="activeSlideIndex"
      :no-swiping="true"
      no-swiping-class="todo-no-swipe"
      class="h-full bg-slate-100"
      @swiper="syncActiveStageIndex"
      @slideChange="syncActiveStageIndex"
      @activeIndexChange="syncActiveStageIndex"
      @realIndexChange="syncActiveStageIndex"
    >
      <SwiperSlide class="h-full bg-slate-100">
        <CalendarPage />
      </SwiperSlide>
      <SwiperSlide v-for="(stage, index) in stages" :key="stage.id" class="h-full bg-slate-100">
        <StagePage :stage="stage" :index="index" :total-stages="stages.length" :is-today="index === todayStageIndex" />
      </SwiperSlide>
    </Swiper>

    <AddTaskSheet
      :visible="isAddTaskSheetOpen"
      :initial-due-date="getNextStageDate(activeStageId)"
      :initial-client-tag="defaultClientTagForNewTask"
      :client-tags="store.clientTags"
      :can-submit="canCreateTask"
      @close="closeAddTaskSheet"
      @submit="submitFromSheet"
    />

    <div
      v-if="!isAddTaskSheetOpen && !isCalendarSlideActive"
      class="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-full -translate-x-1/2 items-center justify-between gap-2 px-4"
    >
      <button
        type="button"
        class="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg transition hover:bg-slate-100 active:scale-[0.98]"
        aria-label="Open account menu"
        title="Account"
        @click="toggleProfile"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20a8 8 0 0116 0" />
        </svg>
      </button>

      <button
        type="button"
        class="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="!canCreateTask"
        @click="openAddTaskSheet"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        Add Task
      </button>
    </div>

    <div
      v-if="store.cloudError && !isAddTaskSheetOpen"
      class="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-[min(92vw,34rem)] -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"
    >
      <p class="text-xs font-medium text-rose-700">{{ store.cloudError }}</p>
      <button
        type="button"
        class="mt-1 inline-flex h-8 items-center justify-center rounded-md border border-rose-300 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        @click="store.retryCloudSync()"
      >
        Retry sync
      </button>
    </div>

    <p
      v-if="!canCreateTask && !isAddTaskSheetOpen"
      class="fixed bottom-[calc(0.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 text-xs font-medium text-slate-500"
    >
      Connecting to cloud sync...
    </p>

    <div v-if="isProfileOpen" class="fixed inset-0 z-30" @click="closeProfile" />
    <section
      v-if="isProfileOpen"
      class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-40 w-[min(88vw,19rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:right-6"
      @click.stop
    >
      <p class="truncate text-xs font-medium text-slate-500">Signed in as</p>
      <p class="truncate text-sm font-semibold text-slate-900">{{ authStore.user?.email ?? 'No email' }}</p>
      <button
        type="button"
        class="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        @click="goToContentIdeation"
      >
        Content Ideation
      </button>
      <button
        type="button"
        class="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        @click="signOut"
      >
        Sign Out
      </button>
    </section>
  </div>
</template>
