import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import WujieVue from 'wujie-vue3';
import App from './App.vue';
import HomeView from './views/HomeView.vue';
import PlayView from './views/PlayView.vue';
import './style.css';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/play/:gameId', component: PlayView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
createApp(App).use(router).use(WujieVue).mount('#app');
