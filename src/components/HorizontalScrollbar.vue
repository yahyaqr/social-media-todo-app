<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
  height?: number;
  minThumbWidth?: number;
}>(), {
  height: 14,
  minThumbWidth: 48
});

const emit = defineEmits<{
  scrollTo: [left: number];
}>();

const trackRef = ref<HTMLDivElement | null>(null);

const dragState = {
  active: false,
  startClientX: 0,
  startScrollLeft: 0
};

const maxScrollLeft = computed(() =>
  Math.max(props.scrollWidth - props.clientWidth, 0)
);

const hasOverflow = computed(() => maxScrollLeft.value > 0);

const thumbWidth = computed(() => {
  if (!props.clientWidth || !props.scrollWidth || props.scrollWidth <= props.clientWidth) {
    return 0;
  }

  return Math.max(props.clientWidth * (props.clientWidth / props.scrollWidth), props.minThumbWidth);
});

const thumbOffset = computed(() => {
  if (!hasOverflow.value) {
    return 0;
  }

  const travel = props.clientWidth - thumbWidth.value;

  if (travel <= 0) {
    return 0;
  }

  return (props.scrollLeft / maxScrollLeft.value) * travel;
});

const thumbStyle = computed(() => ({
  width: `${thumbWidth.value}px`,
  transform: `translateX(${thumbOffset.value}px)`
}));

const emitScrollTo = (left: number): void => {
  emit('scrollTo', Math.max(0, Math.min(left, maxScrollLeft.value)));
};

const beginThumbDrag = (clientX: number): void => {
  if (!hasOverflow.value) {
    return;
  }

  dragState.active = true;
  dragState.startClientX = clientX;
  dragState.startScrollLeft = props.scrollLeft;
};

const moveThumbDrag = (clientX: number): void => {
  if (!dragState.active) {
    return;
  }

  const travel = props.clientWidth - thumbWidth.value;

  if (travel <= 0) {
    return;
  }

  const deltaRatio = (clientX - dragState.startClientX) / travel;
  emitScrollTo(dragState.startScrollLeft + deltaRatio * maxScrollLeft.value);
};

const endThumbDrag = (): void => {
  dragState.active = false;
};

const handleThumbMouseDown = (event: MouseEvent): void => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  beginThumbDrag(event.clientX);
};

const handleThumbTouchStart = (event: TouchEvent): void => {
  const touch = event.touches[0];

  if (!touch) {
    return;
  }

  event.stopPropagation();
  beginThumbDrag(touch.clientX);
};

const handleDocumentMouseMove = (event: MouseEvent): void => {
  moveThumbDrag(event.clientX);
};

const handleDocumentTouchMove = (event: TouchEvent): void => {
  const touch = event.touches[0];

  if (!touch) {
    return;
  }

  if (dragState.active) {
    event.preventDefault();
  }

  moveThumbDrag(touch.clientX);
};

const handleTrackMouseDown = (event: MouseEvent): void => {
  if (event.button !== 0 || !trackRef.value) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const rect = trackRef.value.getBoundingClientRect();
  const thumbCenter = thumbWidth.value / 2;
  const ratio = (event.clientX - rect.left - thumbCenter) / Math.max(rect.width - thumbWidth.value, 1);
  emitScrollTo(ratio * maxScrollLeft.value);
};

const handleTrackTouchStart = (event: TouchEvent): void => {
  const touch = event.touches[0];

  if (!touch || !trackRef.value) {
    return;
  }

  event.stopPropagation();
  const rect = trackRef.value.getBoundingClientRect();
  const thumbCenter = thumbWidth.value / 2;
  const ratio = (touch.clientX - rect.left - thumbCenter) / Math.max(rect.width - thumbWidth.value, 1);
  emitScrollTo(ratio * maxScrollLeft.value);
};

onMounted(() => {
  document.addEventListener('mousemove', handleDocumentMouseMove);
  document.addEventListener('mouseup', endThumbDrag);
  document.addEventListener('touchmove', handleDocumentTouchMove, { passive: false });
  document.addEventListener('touchend', endThumbDrag);
  document.addEventListener('touchcancel', endThumbDrag);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleDocumentMouseMove);
  document.removeEventListener('mouseup', endThumbDrag);
  document.removeEventListener('touchmove', handleDocumentTouchMove);
  document.removeEventListener('touchend', endThumbDrag);
  document.removeEventListener('touchcancel', endThumbDrag);
});
</script>

<template>
  <div
    v-if="hasOverflow"
    ref="trackRef"
    class="todo-no-swipe horizontal-scrollbar"
    :style="{ height: `${height}px` }"
    @mousedown="handleTrackMouseDown"
    @touchstart.stop="handleTrackTouchStart"
  >
    <div
      class="horizontal-scrollbar__thumb"
      :style="thumbStyle"
      @mousedown.stop="handleThumbMouseDown"
      @touchstart.stop="handleThumbTouchStart"
    />
  </div>
</template>

<style scoped>
.horizontal-scrollbar {
  position: relative;
  background-color: rgb(226 232 240);
  touch-action: none;
  opacity: 0.75;
  transition: opacity 160ms ease;
}

.horizontal-scrollbar:hover,
.horizontal-scrollbar--active {
  opacity: 1;
}

.horizontal-scrollbar__thumb {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 4px;
  background-color: rgb(208, 215, 224);
  cursor: grab;
}
</style>
