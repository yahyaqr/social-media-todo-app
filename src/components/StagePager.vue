<script setup lang="ts">
import { computed } from 'vue';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { stages } from '../data/stages';
import StagePage from './StagePage.vue';

import 'swiper/css';

const getTodayStageIndex = (): number => {
  const today = new Date().getDay();

  if (today >= 1 && today <= 5) {
    return today - 1;
  }

  // Weekend fallback: keep users on the first stage.
  return 0;
};

const todayStageIndex = computed(() => getTodayStageIndex());
</script>

<template>
  <Swiper
    :slides-per-view="1"
    :space-between="0"
    :initial-slide="todayStageIndex"
    class="h-full bg-slate-100"
  >
    <SwiperSlide v-for="(stage, index) in stages" :key="stage.id" class="h-full bg-slate-100">
      <StagePage :stage="stage" :index="index" :total-stages="stages.length" :is-today="index === todayStageIndex" />
    </SwiperSlide>
  </Swiper>
</template>
