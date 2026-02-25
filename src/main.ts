import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { initFirestorePersistence } from './lib/firebase';
import { useTodosStore } from './stores/todos';
import './styles.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

const todosStore = useTodosStore(pinia);

void initFirestorePersistence();
void todosStore.initCloudSync();

registerSW({ immediate: true });

app.mount('#app');
