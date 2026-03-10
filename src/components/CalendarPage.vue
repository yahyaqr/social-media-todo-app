<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toPng } from 'html-to-image';
import { useRouter } from 'vue-router';
import { stages, type StageId, type Todo } from '../data/stages';
import { ALL_CLIENT_TAGS, UNTAGGED_CLIENT_TAG } from '../lib/taskFilters';
import { useTodosStore } from '../stores/todos';
import BasicDropdown from './BasicDropdown.vue';

type CalendarTask = {
  stageId: StageId;
  todoId: string;
  title: string;
  clientTag: string;
  dueAt: number;
  done: boolean;
  stageTitle: string;
};

type CalendarDay = {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: CalendarTask[];
};

const router = useRouter();
const store = useTodosStore();

const stageFilter = ref<'all' | StageId>('all');
const clientTagFilter = ref<string>(ALL_CLIENT_TAGS);
const visibleMonth = ref(startOfMonth(new Date()));
const selectedDateKey = ref(toDateKey(new Date()));
const monthHeaderRef = ref<HTMLElement | null>(null);
const monthSurfaceRef = ref<HTMLElement | null>(null);
const isDownloadingImage = ref(false);

const stageOptions = [
  { value: 'all', label: 'All stages' },
  ...stages.map((stage) => ({
    value: stage.id,
    label: `${stage.day} - ${stage.title}`
  }))
];

const hasUntaggedTasks = computed(() =>
  stages.some((stage) => store.todosByStage[stage.id].some((todo) => !todo.clientTag?.trim()))
);

const clientTagOptions = computed<Array<{ value: string; label: string }>>(() => {
  const options = [{ value: ALL_CLIENT_TAGS, label: 'All client tags' }];

  if (hasUntaggedTasks.value) {
    options.push({ value: UNTAGGED_CLIENT_TAG, label: 'No client tag' });
  }

  return [
    ...options,
    ...store.clientTags.map((tag) => ({
      value: tag,
      label: tag
    }))
  ];
});

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function toDateKey(value: Date | number): string {
  const date = typeof value === 'number' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function isSameDay(left: Date, right: Date): boolean {
  return toDateKey(left) === toDateKey(right);
}

function addDays(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

const matchesStageFilter = (stageId: StageId): boolean =>
  stageFilter.value === 'all' || stageFilter.value === stageId;

const matchesClientTagFilter = (todo: Todo): boolean => {
  if (clientTagFilter.value === ALL_CLIENT_TAGS) {
    return true;
  }

  if (clientTagFilter.value === UNTAGGED_CLIENT_TAG) {
    return !todo.clientTag?.trim();
  }

  return (todo.clientTag ?? '').trim() === clientTagFilter.value;
};

const allFilteredTasks = computed<CalendarTask[]>(() =>
  stages.flatMap((stage) =>
    store.todosByStage[stage.id]
      .filter((todo) => todo.dueAt !== undefined)
      .filter((todo) => !todo.done)
      .filter((todo) => matchesStageFilter(stage.id) && matchesClientTagFilter(todo))
      .map((todo) => ({
        stageId: stage.id,
        todoId: todo.id,
        title: todo.text,
        clientTag: (todo.clientTag ?? '').trim(),
        dueAt: todo.dueAt as number,
        done: todo.done,
        stageTitle: stage.title
      }))
  )
);

const tasksByDateKey = computed<Record<string, CalendarTask[]>>(() => {
  const grouped: Record<string, CalendarTask[]> = {};

  for (const task of allFilteredTasks.value) {
    const key = toDateKey(task.dueAt);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((left, right) => {
      if (left.done !== right.done) {
        return left.done ? 1 : -1;
      }

      if (left.stageId !== right.stageId) {
        return stages.findIndex((stage) => stage.id === left.stageId) - stages.findIndex((stage) => stage.id === right.stageId);
      }

      return left.title.localeCompare(right.title);
    });
  }

  return grouped;
});

const monthLabel = computed(() =>
  visibleMonth.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
);

const activeExportFilters = computed<string[]>(() => {
  const filters: string[] = [];

  if (stageFilter.value !== 'all') {
    const stage = stages.find((item) => item.id === stageFilter.value);
    if (stage) {
      filters.push(`Stage: ${stage.title}`);
    }
  }

  if (clientTagFilter.value !== ALL_CLIENT_TAGS) {
    if (clientTagFilter.value === UNTAGGED_CLIENT_TAG) {
      filters.push('Client tag: No client tag');
    } else {
      filters.push(`Client tag: ${clientTagFilter.value}`);
    }
  }

  return filters;
});

const visibleDays = computed<CalendarDay[]>(() => {
  const monthStart = startOfMonth(visibleMonth.value);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const today = startOfDay(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const key = toDateKey(date);

    return {
      key,
      date,
      isCurrentMonth: isSameMonth(date, monthStart),
      isToday: isSameDay(date, today),
      tasks: tasksByDateKey.value[key] ?? []
    };
  });
});

const selectedDay = computed<CalendarDay | null>(() => {
  return visibleDays.value.find((day) => day.key === selectedDateKey.value) ?? null;
});

const stageBadgeClass = (stageId: StageId): string => {
  switch (stageId) {
    case 'ideation':
      return 'bg-blue-100 text-blue-700';
    case 'research':
      return 'bg-sky-100 text-sky-700';
    case 'draft':
      return 'bg-emerald-100 text-emerald-700';
    case 'produce':
      return 'bg-amber-100 text-amber-700';
    case 'publish':
      return 'bg-rose-100 text-rose-700';
  }
};

const dayAccentClass = (stageId: StageId): string => {
  switch (stageId) {
    case 'ideation':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'research':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'draft':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'produce':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'publish':
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
};

const selectDay = (day: CalendarDay): void => {
  selectedDateKey.value = day.key;
  if (!day.isCurrentMonth) {
    visibleMonth.value = startOfMonth(day.date);
  }
};

const openTask = (task: CalendarTask): void => {
  void router.push({ name: 'task-detail', params: { stageId: task.stageId, todoId: task.todoId } });
};

const goToPreviousMonth = (): void => {
  visibleMonth.value = addMonths(visibleMonth.value, -1);
};

const goToNextMonth = (): void => {
  visibleMonth.value = addMonths(visibleMonth.value, 1);
};

const goToToday = (): void => {
  const today = new Date();
  visibleMonth.value = startOfMonth(today);
  selectedDateKey.value = toDateKey(today);
};

const createExportHeader = (width: number): HTMLElement => {
  const header = document.createElement('div');
  header.style.width = `${width}px`;
  header.style.boxSizing = 'border-box';
  header.style.display = 'flex';
  header.style.flexDirection = 'column';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'center';
  header.style.gap = activeExportFilters.value.length ? '0.625rem' : '0';
  header.style.padding = activeExportFilters.value.length ? '1.5rem 1.5rem 1rem' : '1.5rem';
  header.style.borderBottom = '1px solid rgb(226 232 240)';
  header.style.background = '#ffffff';

  const title = document.createElement('p');
  title.textContent = monthLabel.value;
  title.style.margin = '0';
  title.style.fontSize = activeExportFilters.value.length ? '2rem' : '2.25rem';
  title.style.lineHeight = activeExportFilters.value.length ? '2.5rem' : '2.75rem';
  title.style.fontWeight = '700';
  title.style.color = 'rgb(15 23 42)';
  title.style.textAlign = 'center';
  header.appendChild(title);

  if (activeExportFilters.value.length) {
    const metaRow = document.createElement('div');
    metaRow.style.display = 'flex';
    metaRow.style.flexWrap = 'wrap';
    metaRow.style.alignItems = 'center';
    metaRow.style.justifyContent = 'center';
    metaRow.style.columnGap = '1.5rem';
    metaRow.style.rowGap = '0.375rem';

    for (const label of activeExportFilters.value) {
      const item = document.createElement('span');
      item.textContent = label;
      item.style.fontSize = '0.875rem';
      item.style.lineHeight = '1.25rem';
      item.style.fontWeight = '600';
      item.style.color = 'rgb(100 116 139)';
      item.style.whiteSpace = 'nowrap';
      metaRow.appendChild(item);
    }

    header.appendChild(metaRow);
  }

  return header;
};

const waitForNextFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

const downloadCalendarImage = async (): Promise<void> => {
  if (!monthHeaderRef.value || !monthSurfaceRef.value || isDownloadingImage.value) {
    return;
  }

  isDownloadingImage.value = true;

  try {
    const gridSource = monthSurfaceRef.value;
    const exportHost = document.createElement('div');
    const exportNode = document.createElement('section');
    const exportHeader = createExportHeader(gridSource.scrollWidth);
    const exportGrid = gridSource.cloneNode(true) as HTMLElement;
    exportHost.style.position = 'fixed';
    exportHost.style.left = '0';
    exportHost.style.top = '0';
    exportHost.style.opacity = '0';
    exportHost.style.pointerEvents = 'none';
    exportHost.style.zIndex = '-1';
    exportHost.style.overflow = 'visible';
    exportHost.style.background = '#ffffff';
    exportHost.dataset.calendarExportClone = 'true';
    exportNode.style.width = `${gridSource.scrollWidth}px`;
    exportNode.style.minWidth = `${gridSource.scrollWidth}px`;
    exportNode.style.maxWidth = 'none';
    exportNode.style.height = 'auto';
    exportNode.style.overflow = 'visible';
    exportNode.style.background = '#ffffff';
    exportNode.style.boxSizing = 'border-box';
    exportNode.style.border = '1px solid rgb(226 232 240)';
    exportGrid.style.width = `${gridSource.scrollWidth}px`;
    exportGrid.style.minWidth = `${gridSource.scrollWidth}px`;
    exportGrid.style.maxWidth = 'none';
    exportNode.appendChild(exportHeader);
    exportNode.appendChild(exportGrid);
    exportHost.appendChild(exportNode);
    document.body.appendChild(exportHost);

    await waitForNextFrame();
    await waitForNextFrame();

    const dataUrl = await toPng(exportNode, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio: Math.max(2, window.devicePixelRatio || 1),
      width: gridSource.scrollWidth,
      height: exportNode.scrollHeight,
      canvasWidth: gridSource.scrollWidth,
      canvasHeight: exportNode.scrollHeight,
      style: {
        width: `${gridSource.scrollWidth}px`,
        height: `${exportNode.scrollHeight}px`
      }
    });
    document.body.removeChild(exportHost);

    const link = document.createElement('a');
    const monthKey = `${visibleMonth.value.getFullYear()}-${String(visibleMonth.value.getMonth() + 1).padStart(2, '0')}`;
    link.download = `calendar-${monthKey}.png`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('[calendar-export] failed', error);
    window.alert('Failed to download the calendar image. Please try again.');
  } finally {
    const strayExportNode = document.querySelector('[data-calendar-export-clone="true"]');
    if (strayExportNode instanceof HTMLElement) {
      strayExportNode.parentElement?.remove();
    }
    isDownloadingImage.value = false;
  }
};

watch(visibleMonth, (month) => {
  const selected = selectedDay.value;
  if (selected && isSameMonth(selected.date, month)) {
    return;
  }

  const monthStartKey = toDateKey(month);
  const firstVisibleTaskDay = visibleDays.value.find((day) => day.isCurrentMonth && day.tasks.length)?.key;
  selectedDateKey.value = firstVisibleTaskDay ?? monthStartKey;
}, { immediate: true });
</script>

<template>
  <article class="h-full overflow-y-auto scrollbar-width-none bg-slate-100 px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-5">
    <div class="flex gap-2">
      <BasicDropdown v-model="stageFilter" class="w-1/2" :options="stageOptions" label="Stage" />
      <BasicDropdown v-model="clientTagFilter" class="w-1/2" :options="clientTagOptions" label="Client tag" />
    </div>

    <section class="mt-3 bg-white shadow-sm ring-1 ring-slate-200">
      <div
        ref="monthHeaderRef"
        class="calendar-header-row grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-slate-200 px-3 py-3 sm:px-4"
      >
        <button
          type="button"
          class="calendar-nav-control inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:bg-slate-100"
          aria-label="Previous month"
          @click="goToPreviousMonth"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div class="calendar-header-content min-w-0 text-center">
          <p class="calendar-month-title truncate text-lg font-semibold text-slate-900">{{ monthLabel }}</p>
          <button
            type="button"
            class="calendar-jump-today mt-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            @click="goToToday"
          >
            Jump to today
          </button>
          <div v-if="activeExportFilters.length" class="calendar-export-filters mt-1 hidden">
            <p
              v-for="filterLabel in activeExportFilters"
              :key="filterLabel"
              class="text-xs font-medium text-slate-500"
            >
              {{ filterLabel }}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="calendar-nav-control inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:bg-slate-100"
          aria-label="Next month"
          @click="goToNextMonth"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div class="overflow-x-auto overscroll-x-contain">
        <div ref="monthSurfaceRef" class="calendar-grid-width bg-white">
          <div class="grid grid-cols-7 gap-px border-b border-slate-200 bg-slate-200 px-px pt-px">
            <div
              v-for="label in weekdayLabels"
              :key="label"
              class="bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs"
            >
              {{ label }}
            </div>
          </div>

          <div class="grid grid-cols-7 gap-px bg-slate-200 p-px">
            <button
              v-for="day in visibleDays"
              :key="day.key"
              type="button"
              class="calendar-day-cell calendar-day-selectable bg-white px-1.5 py-1.5 text-left align-top transition active:scale-[0.99] sm:px-2 sm:py-2"
              :class="[
                day.isCurrentMonth ? 'text-slate-900' : 'bg-slate-50 text-slate-400',
                selectedDateKey === day.key ? 'ring-2 ring-inset ring-blue-500' : '',
                day.isToday ? 'calendar-today' : ''
              ]"
              @click="selectDay(day)"
            >
              <div class="flex items-center justify-between gap-1">
                <span
                  class="calendar-day-number inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold sm:h-8 sm:w-8"
                  :class="day.isToday ? 'bg-slate-900 text-white' : 'bg-transparent text-current'"
                >
                  {{ day.date.getDate() }}
                </span>
                <span
                  v-if="day.tasks.length"
                  class="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {{ day.tasks.length }}
                </span>
              </div>

              <div class="mt-1.5 space-y-1">
                <button
                  v-for="task in day.tasks.slice(0, 2)"
                  :key="task.todoId"
                  type="button"
                  class="w-full rounded-xl border px-1.5 py-1 text-[10px] font-medium leading-3 sm:px-2 sm:text-[11px]"
                  :class="[dayAccentClass(task.stageId), task.done ? 'opacity-60 line-through' : '']"
                  @click.stop="openTask(task)"
                >
                  {{ task.title }}
                </button>

                <div
                  v-if="day.tasks.length > 2"
                  class="rounded-xl border border-dashed border-slate-300 px-1.5 py-1 text-[10px] font-semibold text-slate-500 sm:px-2 sm:text-[11px]"
                >
                  +{{ day.tasks.length - 2 }} more
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="mt-3 bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Selected day</p>
          <h2 class="text-lg font-semibold text-slate-900">
            {{ selectedDay?.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? 'No day selected' }}
          </h2>
        </div>
        <p
          v-if="selectedDay"
          class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
        >
          {{ selectedDay.tasks.length }} task{{ selectedDay.tasks.length === 1 ? '' : 's' }}
        </p>
      </div>

      <div v-if="selectedDay?.tasks.length" class="mt-3 space-y-2">
        <button
          v-for="task in selectedDay.tasks"
          :key="`${task.stageId}-${task.todoId}`"
          type="button"
          class="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100"
          @click="openTask(task)"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                :class="stageBadgeClass(task.stageId)"
              >
                {{ task.stageTitle }}
              </span>
              <span
                v-if="task.clientTag"
                class="truncate text-xs font-medium text-slate-500"
              >
                {{ task.clientTag }}
              </span>
            </div>
            <p class="mt-2 text-sm font-semibold text-slate-900" :class="task.done ? 'line-through opacity-60' : ''">
              {{ task.title }}
            </p>
          </div>

          <svg viewBox="0 0 24 24" class="mt-1 h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <p
        v-else
        class="mt-3 rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500"
      >
        No due-dated tasks match the current filters on this day.
      </p>
    </section>

    <button
      type="button"
      class="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
      :disabled="isDownloadingImage"
      @click="downloadCalendarImage"
    >
      {{ isDownloadingImage ? 'Preparing image...' : 'Download Calendar Image' }}
    </button>
  </article>
</template>

<style scoped>
.scrollbar-width-none {
  scrollbar-width: none;
}

.calendar-grid-width {
  --calendar-cell-size: clamp(8.5rem, 18vw, 10rem);
  min-width: calc(var(--calendar-cell-size) * 7);
}

.calendar-day-cell {
  min-height: var(--calendar-cell-size);
}

.calendar-today {
  background-image: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0));
}

[data-calendar-export-clone='true'] .calendar-today {
  background-image: none;
}

[data-calendar-export-clone='true'] .calendar-nav-control,
[data-calendar-export-clone='true'] .calendar-jump-today {
  visibility: hidden;
}

[data-calendar-export-clone='true'] .calendar-day-number {
  background: transparent !important;
  color: inherit !important;
}

[data-calendar-export-clone='true'] .calendar-day-selectable {
  box-shadow: none !important;
}
</style>
