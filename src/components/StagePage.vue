<script setup lang="ts">
import { computed } from 'vue';
import type { Stage } from '../data/stages';
import { useTodosStore } from '../stores/todos';
import TodoList from './TodoList.vue';

const props = defineProps<{
  stage: Stage;
  index: number;
  totalStages: number;
  isToday: boolean;
}>();

const store = useTodosStore();

const progressText = computed(() => store.stageProgress(props.stage.id));
</script>

<template>
  <article class="h-full overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-5">
    <header
      class="mb-3 rounded-2xl p-3 shadow-sm ring-1 sm:mb-4 sm:p-4"
      :class="props.isToday ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-slate-200'"
    >
      <div class="mb-2 flex items-center justify-between gap-3">
        <p
          class="text-xs font-medium uppercase tracking-wide sm:text-sm"
          :class="props.isToday ? 'text-amber-700' : 'text-blue-600'"
        >
          Stage {{ index + 1 }} / {{ totalStages }}
          <span v-if="props.isToday" class="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-amber-800">Today</span>
        </p>
        <p class="text-xs font-semibold text-slate-600 sm:text-sm">{{ progressText }}</p>
      </div>
      <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">
        <span class="mr-2 text-base font-medium text-slate-500 sm:text-lg">{{ stage.day }}</span>
        <span class="mr-2 text-slate-300">&bull;</span>
        <span>{{ stage.title }}</span>
      </h1>
      <p class="mt-1.5 text-sm leading-5 text-slate-600 sm:mt-2 sm:leading-6">{{ stage.description }}</p>
    </header>

    <TodoList :stage-id="stage.id" />
  </article>
</template>
