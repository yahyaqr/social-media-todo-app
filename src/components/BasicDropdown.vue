<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type Option = {
  value: string;
  label: string;
};

const props = defineProps<{
  modelValue: string;
  options: Option[];
  label?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === props.modelValue);
  return selected?.label ?? props.label ?? 'Select';
});

const toggle = (): void => {
  isOpen.value = !isOpen.value;
};

const close = (): void => {
  isOpen.value = false;
};

const selectOption = (value: string): void => {
  emit('update:modelValue', value);
  close();
};

const handleDocumentClick = (event: MouseEvent): void => {
  if (!rootRef.value) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && !rootRef.value.contains(target)) {
    close();
  }
};

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 outline-none ring-blue-300 focus:ring-2"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <span>{{ selectedLabel }}</span>
      <svg
        viewBox="0 0 24 24"
        class="h-4 w-4 text-slate-500 transition"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
        :class="{ 'bg-blue-50 text-blue-700': modelValue === option.value }"
        @click="selectOption(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
