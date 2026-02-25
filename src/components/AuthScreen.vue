<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '../stores/auth';

type AuthMode = 'signin' | 'register';

const authStore = useAuthStore();

const mode = ref<AuthMode>('signin');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const submitError = ref<string | null>(null);
const isSubmitting = ref(false);

const isRegisterMode = computed(() => mode.value === 'register');
const title = computed(() => (isRegisterMode.value ? 'Create Account' : 'Sign In'));
const buttonLabel = computed(() => (isRegisterMode.value ? 'Register' : 'Sign In'));

const toggleMode = (): void => {
  mode.value = isRegisterMode.value ? 'signin' : 'register';
  submitError.value = null;
};

const submit = async (): Promise<void> => {
  const normalizedEmail = email.value.trim().toLowerCase();
  if (!normalizedEmail || !password.value) {
    submitError.value = 'Email and password are required.';
    return;
  }

  if (isRegisterMode.value) {
    if (password.value.length < 6) {
      submitError.value = 'Password must be at least 6 characters.';
      return;
    }

    if (password.value !== confirmPassword.value) {
      submitError.value = 'Passwords do not match.';
      return;
    }
  }

  submitError.value = null;
  isSubmitting.value = true;

  try {
    if (isRegisterMode.value) {
      await authStore.registerWithEmail(normalizedEmail, password.value);
    } else {
      await authStore.signInWithEmail(normalizedEmail, password.value);
    }
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : 'Authentication failed.';
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="flex min-h-[100dvh] items-center justify-center bg-slate-100 px-4 py-8">
    <section class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <h1 class="text-xl font-semibold text-slate-900">{{ title }}</h1>
      <p class="mt-1 text-sm text-slate-600">Use your email and password to access your tasks.</p>

      <form class="mt-4 space-y-3" @submit.prevent="submit">
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="Email"
          class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
        />

        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="Password"
          class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
        />

        <input
          v-if="isRegisterMode"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Confirm password"
          class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
        />

        <p v-if="submitError || authStore.authError" class="text-sm text-rose-600">
          {{ submitError ?? authStore.authError }}
        </p>

        <button
          type="submit"
          class="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? 'Please wait...' : buttonLabel }}
        </button>
      </form>

      <button type="button" class="mt-3 text-sm font-medium text-blue-700 hover:underline" @click="toggleMode">
        {{ isRegisterMode ? 'Have an account? Sign in' : 'Need an account? Register' }}
      </button>
    </section>
  </div>
</template>
