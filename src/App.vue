<script setup lang="ts">
import { onMounted, watch } from 'vue';
import AuthScreen from './components/AuthScreen.vue';
import StagePager from './components/StagePager.vue';
import { useAuthStore } from './stores/auth';
import { useTodosStore } from './stores/todos';

const authStore = useAuthStore();
const todosStore = useTodosStore();

onMounted(() => {
  authStore.initAuth();
});

watch(
  () => authStore.user,
  (user) => {
    if (user) {
      void todosStore.initCloudSync();
      return;
    }

    todosStore.stopCloudSync();
  },
  { immediate: true }
);
</script>

<template>
  <main v-if="authStore.initializing" class="flex h-[100dvh] items-center justify-center bg-slate-100 text-slate-600">
    Loading...
  </main>

  <AuthScreen v-else-if="!authStore.user" />

  <main v-else class="h-[100dvh] bg-slate-100 text-slate-900">
    <div class="h-full">
      <StagePager />
    </div>

    <p v-if="todosStore.cloudError" class="px-3 pb-2 pt-1 text-xs text-rose-600 sm:px-4">
      {{ todosStore.cloudError }}
    </p>
  </main>
</template>
