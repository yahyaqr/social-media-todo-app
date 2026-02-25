import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { initFirestorePersistence } from './lib/firebase';
import './styles.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

void initFirestorePersistence();

registerSW({ immediate: true });

app.mount('#app');
