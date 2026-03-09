import { createRouter, createWebHistory } from 'vue-router';
import ContentIdeationPage from '../components/ContentIdeationPage.vue';
import StagePager from '../components/StagePager.vue';
import TaskDetailPage from '../components/TaskDetailPage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: StagePager
    },
    {
      path: '/task/:stageId/:todoId',
      name: 'task-detail',
      component: TaskDetailPage
    },
    {
      path: '/content-ideation',
      name: 'content-ideation',
      component: ContentIdeationPage
    }
  ]
});

export default router;
