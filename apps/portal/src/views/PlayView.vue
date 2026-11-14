<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, Maximize, Pause, Play, RotateCcw } from '@lucide/vue';
import { destroyApp } from 'wujie';
import { getGameUrl, type GameCommand, type PlatformBridge } from '@youxi/contracts';
import { catalog, catalogError, loadCatalog } from '../catalog';
import { selectDimension } from '../theme';

const route = useRoute();
const gameId = String(route.params.gameId);
const host = ref<HTMLElement>();
const ready = ref(false);
const error = ref('');
const score = ref(0);
const paused = ref(false);
const mounted = ref(true);
const session = ref(0);
let timeout: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(command: GameCommand) => void>();
const game = computed(() => catalog.value?.games.find(item => item.id === gameId && item.enabled && item.status === 'playable'));
const url = computed(() => catalog.value && game.value ? getGameUrl(catalog.value, game.value) : '');
const appName = computed(() => `game-${game.value?.id ?? 'unknown'}-${session.value}`);
const bridge: PlatformBridge = {
  emit(event) {
    if (event.gameId !== game.value?.id) return;
    if (event.type === 'ready') { ready.value = true; clearTimeout(timeout); }
    if (event.type === 'score') score.value = event.score;
    if (event.type === 'error') { error.value = event.message; clearTimeout(timeout); }
  },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};
function command(value: GameCommand) { listeners.forEach(listener => listener(value)); }
function togglePause() { paused.value = !paused.value; command(paused.value ? 'pause' : 'resume'); }
function restart() { score.value = 0; paused.value = false; command('restart'); }
function startTimeout() { clearTimeout(timeout); timeout = setTimeout(() => { if (!ready.value) error.value = '游戏启动超时，请确认子平台已启动后重试。'; }, 25000); }
async function cleanup(name: string) { clearTimeout(timeout); listeners.clear(); await destroyApp(name); }
async function retry() {
  const previous = appName.value;
  mounted.value = false;
  await nextTick(); await cleanup(previous);
  session.value++; ready.value = false; error.value = ''; score.value = 0; paused.value = false;
  mounted.value = true; startTimeout();
}
async function fullscreen() {
  try { await host.value?.requestFullscreen(); }
  catch { error.value = '当前浏览器未允许全屏，可以继续在页面内游玩。'; }
}
watch(game, (next) => { if (next && catalog.value) selectDimension(catalog.value.apps[next.appId].dimension); });
onMounted(async () => { await loadCatalog(); if (game.value) { selectDimension(catalog.value!.apps[game.value.appId].dimension); startTimeout(); } });
onUnmounted(() => cleanup(appName.value));
</script>

<template>
  <main class="play-page">
    <RouterLink to="/" class="back-link"><ArrowLeft :size="16"/> 返回游戏大厅</RouterLink>
    <div v-if="catalogError" class="notice" role="alert">{{ catalogError }}</div>
    <div v-else-if="!catalog" class="notice">正在加载…</div>
    <div v-else-if="!game" class="notice">游戏不存在或暂未开放。<RouterLink to="/">返回首页</RouterLink></div>
    <template v-else>
      <div class="play-heading"><div><span class="section-kicker">NOW PLAYING / {{ catalog.apps[game.appId].dimension.toUpperCase() }}</span><h1>{{ game.name }}</h1><p>{{ game.description }}</p></div><span class="score-pill">得分 {{ score }}</span></div>
      <div class="play-toolbar"><span role="status">{{ ready ? (paused ? '游戏已暂停' : '游戏运行中') : '正在启动游戏…' }}</span><div><button :disabled="!ready" @click="togglePause"><Play v-if="paused" :size="15"/><Pause v-else :size="15"/>{{ paused ? '继续' : '暂停' }}</button><button :disabled="!ready" @click="restart"><RotateCcw :size="15"/>重开</button><button @click="fullscreen"><Maximize :size="15"/>全屏</button></div></div>
      <div v-if="error" class="notice" role="alert">{{ error }} <button @click="retry">重新加载</button></div>
      <div ref="host" class="game-host" :aria-label="`${game.name}运行区域`">
        <WujieVue v-if="mounted" :key="appName" :name="appName" :url="url" :props="{ bridge }" :alive="false" :sync="false" width="100%" height="100%" :load-error="() => { error = '子平台加载失败，请检查服务或网络。'; }"/>
      </div>
      <p class="play-tip">{{ game.tags.join(' · ') }} · 点击游戏区域后操作；离开页面会释放当前游戏。</p>
    </template>
  </main>
</template>
