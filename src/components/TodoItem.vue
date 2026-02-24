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
  remove: [stageId: StageId, todoId: string];
  dragStart: [todoId: string];
  dragDrop: [targetId: string];
}>();

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
</script>

<template>
  <li
    class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    :class="{ 'opacity-50': dragging }"
    draggable="true"
    @dragstart="emit('dragStart', todo.id)"
    @dragover.prevent
    @drop="emit('dragDrop', todo.id)"
  >
    <input
      :id="todo.id"
      type="checkbox"
      :checked="todo.done"
      class="mt-1 h-6 w-6 rounded border-slate-300 text-blue-600 accent-blue-600"
      @change="emit('toggle', stageId, todo.id)"
    />
    <div class="min-w-0 flex-1">
      <label
        :for="todo.id"
        class="block text-base leading-6 text-slate-800"
        :class="{ 'text-slate-400 line-through': todo.done }"
      >
        {{ todo.text }}
      </label>
      <p v-if="dueLabel" class="mt-1 text-xs" :class="isOverdue ? 'text-rose-600' : 'text-slate-500'">
        Due {{ dueLabel }}
      </p>
    </div>
    <button
      type="button"
      class="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
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
  </li>
</template>
