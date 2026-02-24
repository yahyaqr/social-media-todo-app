<script setup lang="ts">
import { Swiper, SwiperSlide } from 'swiper/vue';
import { stages } from '../data/stages';
import StagePage from './StagePage.vue';

import 'swiper/css';
</script>

<template>
  <Swiper
    :slides-per-view="1"
    :space-between="0"
    class="h-full bg-slate-100"
  >
    <SwiperSlide v-for="(stage, index) in stages" :key="stage.id" class="h-full bg-slate-100">
      <StagePage :stage="stage" :index="index" :total-stages="stages.length" />
    </SwiperSlide>
  </Swiper>
</template>
