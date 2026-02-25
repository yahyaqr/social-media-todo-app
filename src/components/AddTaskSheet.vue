<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  initialDueDate: string;
  clientTags: string[];
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { text: string; dueDate: string; clientTag: string; links: string[] }];
}>();

const newTodoText = ref('');
const dueDate = ref('');
const clientTag = ref('');
const links = ref<string[]>([]);
const newLink = ref('');
const showClientTagSuggestions = ref(false);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }

    dueDate.value = props.initialDueDate;
  }
);

const filteredClientTags = computed(() => {
  const query = clientTag.value.trim().toLowerCase();
  if (!query) {
    return props.clientTags.slice(0, 8);
  }

  return props.clientTags.filter((tag) => tag.toLowerCase().includes(query)).slice(0, 8);
});

const close = (): void => {
  showClientTagSuggestions.value = false;
  newLink.value = '';
  emit('close');
};

const appendLink = (): void => {
  const trimmed = newLink.value.trim();
  if (!trimmed || links.value.includes(trimmed)) {
    return;
  }

  links.value = [...links.value, trimmed];
  newLink.value = '';
};

const removeLink = (index: number): void => {
  links.value = links.value.filter((_, current) => current !== index);
};

const submit = (): void => {
  const trimmed = newTodoText.value.trim();
  if (!trimmed) {
    return;
  }

  appendLink();

  emit('submit', {
    text: trimmed,
    dueDate: dueDate.value,
    clientTag: clientTag.value,
    links: links.value
  });

  newTodoText.value = '';
  dueDate.value = props.initialDueDate;
  clientTag.value = '';
  links.value = [];
  newLink.value = '';
  showClientTagSuggestions.value = false;
  emit('close');
};

const onClientTagFocus = (): void => {
  showClientTagSuggestions.value = true;
};

const onClientTagBlur = (): void => {
  window.setTimeout(() => {
    showClientTagSuggestions.value = false;
  }, 120);
};

const onClientTagInput = (): void => {
  showClientTagSuggestions.value = true;
};

const selectClientTag = (tag: string): void => {
  clientTag.value = tag;
  showClientTagSuggestions.value = false;
};
</script>

<template>
  <Transition name="sheet-fade">
    <div v-if="visible" class="fixed inset-0 z-40 bg-slate-100/95" @click="close" />
  </Transition>

  <Transition name="sheet-up">
    <section
      v-if="visible"
      class="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200 sm:mx-auto sm:mb-4 sm:max-w-xl sm:rounded-2xl sm:p-4"
      @click.stop
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold text-slate-900">Add Task</h2>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="Close add task"
          title="Close"
          @click="close"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form class="space-y-2.5" @submit.prevent="submit">
        <input
          v-model="newTodoText"
          type="text"
          placeholder="Add a task..."
          class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2 sm:px-4 sm:py-3 sm:text-base"
        />

        <input
          v-model="dueDate"
          type="date"
          class="date-input min-h-12 block w-full max-w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none ring-blue-300 focus:ring-2 sm:px-4 sm:py-3 sm:text-base"
          aria-label="Due date"
        />

        <div class="relative">
          <input
            v-model="clientTag"
            type="text"
            placeholder="Client tag (optional)"
            class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2 sm:px-4 sm:py-3 sm:text-base"
            aria-label="Client tag"
            @focus="onClientTagFocus"
            @blur="onClientTagBlur"
            @input="onClientTagInput"
          />
          <div
            v-if="showClientTagSuggestions && filteredClientTags.length"
            class="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            <button
              v-for="tag in filteredClientTags"
              :key="tag"
              type="button"
              class="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              :class="{ 'bg-blue-50 text-blue-700': clientTag === tag }"
              @mousedown.prevent="selectClientTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex gap-2">
            <input
              v-model="newLink"
              type="url"
              placeholder="Add link (optional)"
              class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2 sm:px-4 sm:py-3 sm:text-base"
              aria-label="Add link"
              @keydown.enter.prevent="appendLink"
            />
            <button
              type="button"
              class="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 px-3 text-slate-700 hover:bg-slate-100"
              aria-label="Add link"
              title="Add link"
              @click="appendLink"
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
          <div v-if="links.length" class="space-y-1">
            <div
              v-for="(item, index) in links"
              :key="`${item}-${index}`"
              class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
            >
              <a :href="item" target="_blank" rel="noopener noreferrer" class="truncate text-blue-700 hover:underline">
                {{ item }}
              </a>
              <button
                type="button"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                aria-label="Remove link"
                title="Remove link"
                @click="removeLink(index)"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          class="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Add Task
        </button>
      </form>
    </section>
  </Transition>
</template>

<style scoped>
.sheet-up-enter-active,
.sheet-up-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.sheet-up-enter-from,
.sheet-up-leave-to {
  transform: translateY(18px);
  opacity: 0;
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}
</style>
