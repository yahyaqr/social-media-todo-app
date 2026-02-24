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
    draggable="true"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop="onDragDrop"
  >
    <input
      :id="todo.id"
      type="checkbox"
      :checked="todo.done"
      class="mt-1 h-6 w-6 rounded border-slate-300 text-blue-600 accent-blue-600"
      @change="emit('toggle', stageId, todo.id)"
    />

    <div class="min-w-0 flex-1">
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
    </div>
  </li>
</template>
