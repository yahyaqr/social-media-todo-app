<script setup lang="ts">
import { computed } from 'vue';
import type { StageId, Todo } from '../data/stages';

const props = defineProps<{
  stageId: StageId;
  todo: Todo;
  dragging?: boolean;
}>();

const emit = defineEmits<{
  toggle: [stageId: StageId, todoId: string];
  dragStart: [todoId: string];
  dragDrop: [targetId: string];
  openDetails: [todoId: string];
}>();

const onDragStart = (): void => {
  emit('dragStart', props.todo.id);
};

const onDragDrop = (): void => {
  emit('dragDrop', props.todo.id);
};

const openDetails = (): void => {
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
</script>

<template>
  <li
    class="flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 shadow-sm transition hover:shadow sm:gap-3 sm:p-3"
    :class="[timingClass, { 'opacity-50': dragging }]"
    draggable="true"
    @click="openDetails"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop="onDragDrop"
  >
    <input
      :id="todo.id"
      type="checkbox"
      :checked="todo.done"
      class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600"
      @click.stop
      @change="emit('toggle', stageId, todo.id)"
    />

    <div class="min-w-0 flex-1">
      <p
        class="line-clamp-2 text-sm font-medium leading-5 text-slate-800 sm:text-[0.95rem]"
        :class="{ 'text-slate-400 line-through': todo.done }"
      >
        {{ todo.text }}
      </p>
      <div v-if="dueLabel || todo.clientTag || todo.link" class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
        <span
          v-if="dueLabel"
          class="rounded-full px-2 py-0.5"
          :class="isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'"
        >
          Due {{ dueLabel }}
        </span>
        <span v-if="todo.clientTag" class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
          {{ todo.clientTag }}
        </span>
        <a
          v-if="todo.link"
          :href="todo.link"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100"
          @click.stop
        >
          Open link
        </a>
      </div>
    </div>
  </li>
</template>
