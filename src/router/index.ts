import { createRouter, createWebHistory } from 'vue-router';
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
    }
  ]
});

export default router;
