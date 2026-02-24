<script setup lang="ts">
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Pagination } from 'swiper/modules';
import { stages } from '../data/stages';
import StagePage from './StagePage.vue';

import 'swiper/css';
import 'swiper/css/pagination';
</script>

<template>
  <Swiper
    :modules="[Pagination]"
    :slides-per-view="1"
    :space-between="0"
    :pagination="{ clickable: true }"
    class="min-h-[100dvh] bg-slate-100"
  >
    <SwiperSlide v-for="(stage, index) in stages" :key="stage.id" class="bg-slate-100">
      <StagePage :stage="stage" :index="index" :total-stages="stages.length" />
    </SwiperSlide>
  </Swiper>
</template>
