<script setup lang="ts">
import { computed } from 'vue';
import type { Stage } from '../data/stages';
import { useTodosStore } from '../stores/todos';
import TodoList from './TodoList.vue';

const props = defineProps<{
  stage: Stage;
  index: number;
  totalStages: number;
}>();

const store = useTodosStore();

const progressText = computed(() => store.stageProgress(props.stage.id));
</script>

<template>
  <article class="min-h-[100dvh] overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5">
    <header class="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div class="mb-2 flex items-center justify-between gap-3">
        <p class="text-sm font-medium uppercase tracking-wide text-blue-600">Stage {{ index + 1 }} / {{ totalStages }}</p>
        <p class="text-sm font-semibold text-slate-600">{{ progressText }}</p>
      </div>
      <h1 class="text-2xl font-bold text-slate-900">{{ stage.title }}</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">{{ stage.description }}</p>
    </header>

    <TodoList :stage-id="stage.id" />
  </article>
</template>
