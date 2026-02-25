<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
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

const userLabel = computed(() => authStore.user?.email ?? 'Signed in');

const signOut = async (): Promise<void> => {
  try {
    await authStore.signOutCurrentUser();
  } catch {
    // Keep this quiet; authStore.authError is surfaced in the auth screen.
  }
};
</script>

<template>
  <main v-if="authStore.initializing" class="flex h-[100dvh] items-center justify-center bg-slate-100 text-slate-600">
    Loading...
  </main>

  <AuthScreen v-else-if="!authStore.user" />

  <main v-else class="flex h-[100dvh] flex-col bg-slate-100 text-slate-900">
    <header class="z-20 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
      <p class="truncate text-xs font-medium text-slate-600 sm:text-sm">{{ userLabel }}</p>
      <button
        type="button"
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:text-sm"
        @click="signOut"
      >
        Sign Out
      </button>
    </header>

    <div class="min-h-0 flex-1">
      <StagePager />
    </div>

    <p v-if="todosStore.cloudError" class="px-3 pb-2 pt-1 text-xs text-rose-600 sm:px-4">
      {{ todosStore.cloudError }}
    </p>
  </main>
</template>
