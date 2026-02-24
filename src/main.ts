import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { useTodosStore } from './stores/todos';
import { debounce, saveState } from './utils/storage';
import './styles.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

const todosStore = useTodosStore(pinia);

watch(
  () => todosStore.todosByStage,
  debounce((todosByStage) => {
    saveState({ todosByStage });
  }, 200),
  { deep: true }
);

registerSW({ immediate: true });

app.mount('#app');
