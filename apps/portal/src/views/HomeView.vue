<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import gsap from 'gsap';
import { ArrowRight, ArrowUpRight, Box, Grid2X2, Search, Sparkles, ExternalLink, Layers3 } from '@lucide/vue';
import { getGameUrl, type Dimension, type GameInfo } from '@youxi/contracts';
import { catalog, catalogError, loadCatalog } from '../catalog';
import { dimension, selectDimension } from '../theme';

const router = useRouter();
const search = ref('');
const view = ref<HTMLElement>();
const slider = ref<HTMLElement>();
let motion: gsap.Context | undefined;
const is3d = computed(() => dimension.value === '3d');
const games = computed(() => (catalog.value?.games ?? [])
  .filter(game => game.enabled && catalog.value?.apps[game.appId].dimension === dimension.value)
  .filter(game => `${game.name} ${game.description} ${game.tags.join(' ')}`.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => b.sort - a.sort));
const readyCount = computed(() => games.value.filter(game => game.status === 'playable').length);
async function switchWorld(next: Dimension) {
  if (next === dimension.value) return;
  selectDimension(next);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.to(slider.value!, { xPercent: next === '3d' ? 100 : 0, duration: .65, ease: 'power3.inOut', overwrite: true });
    await nextTick();
    motion?.add(() => {
      gsap.fromTo('.hero-copy > *', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .55, stagger: .06, overwrite: true });
      gsap.fromTo('.game-card', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .5, stagger: .06, overwrite: true });
    });
  } else gsap.set(slider.value!, { xPercent: next === '3d' ? 100 : 0 });
}
function openGame(game: GameInfo) {
  if (!catalog.value || game.status !== 'playable') return;
  if (game.openMode === 'new-tab') window.open(getGameUrl(catalog.value, game), '_blank', 'noopener,noreferrer');
  else router.push(`/play/${game.id}`);
}
function tabKey(event: KeyboardEvent, current: Dimension) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const target = event.key === 'Home' ? '2d' : event.key === 'End' ? '3d' : current === '2d' ? '3d' : '2d';
  document.getElementById(`world-tab-${target}`)?.focus();
  void switchWorld(target);
}
function playFirst() { const game = games.value.find(item => item.status === 'playable'); if (game) openGame(game); }
onMounted(async () => {
  motion = gsap.context(() => { gsap.set(slider.value!, { xPercent: is3d.value ? 100 : 0 }); }, view.value);
  await loadCatalog();
});
onUnmounted(() => motion?.revert());
</script>

<template>
  <main ref="view">
    <section class="world-bar">
      <div class="world-tabs" role="tablist" aria-label="切换游戏平台">
        <div ref="slider" class="tab-slider" aria-hidden="true"></div>
        <button v-for="world in (['2d','3d'] as const)" :id="`world-tab-${world}`" :key="world" role="tab" :aria-selected="dimension === world" :tabindex="dimension === world ? 0 : -1" aria-controls="world-panel" @click="switchWorld(world)" @keydown="tabKey($event, world)">
          <component :is="world === '2d' ? Grid2X2 : Box" :size="19"/><span>{{ world.toUpperCase() }} {{ world === '2d' ? '乐游场' : '新宇宙' }}</span><small>{{ world === '2d' ? 'PLAY' : 'EXPLORE' }}</small>
        </button>
      </div>
      <div class="world-note"><span class="online-dot"></span> {{ is3d ? '多一个维度，多一种可能' : '简单的快乐，也可以很上头' }}</div>
    </section>

    <div id="world-panel" role="tabpanel" :aria-labelledby="`world-tab-${dimension}`">
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><Sparkles :size="14"/> {{ is3d ? 'STEP INTO ANOTHER DIMENSION' : 'SMALL GAMES. BIG ADVENTURES.' }}</div>
          <h1>{{ is3d ? '跨越屏幕，' : '快乐，不必' }}<br/><span>{{ is3d ? '开启新宇宙。' : '大费周章。' }}</span><span class="title-star">✳</span></h1>
          <p>{{ is3d ? '穿梭于光影与空间。下一个未知世界，等你亲自抵达。' : '一局的时间，给日常放个小假。发现那些简单、纯粹、让人停不下来的好游戏。' }}</p>
          <div class="hero-actions"><button class="primary-button" :disabled="!readyCount" @click="playFirst">即刻开玩 <ArrowUpRight :size="18"/></button><span>无需下载 · 浏览器直接玩</span></div>
          <div class="hero-footnote"><span class="hero-mini-icon"><component :is="is3d ? Layers3 : Grid2X2" :size="16"/></span>{{ is3d ? '立体世界 / 沉浸探索' : '像素、街机、益智，还有更多' }}</div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="art-halo"></div><div class="art-grid"></div>
          <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div>
          <div class="art-stage"></div>
          <div class="main-cube"><div class="cube-face cube-top"></div><div class="cube-face cube-left"></div><div class="cube-face cube-right"></div><div class="cube-eyes"><i></i><i></i></div></div>
          <div class="satellite satellite-a"></div><div class="satellite satellite-b"></div><div class="satellite satellite-c"></div>
          <span class="art-star star-a">✦</span><span class="art-star star-b">+</span>
          <div class="art-coordinate"><span>{{ is3d ? 'WORLD_03' : 'WORLD_02' }}</span><span>{{ is3d ? 'X 128 / Y 64 / Z ∞' : 'INSERT A LITTLE JOY' }}</span></div>
        </div>
      </section>

      <section class="library">
        <div class="library-heading"><div><span class="section-kicker">YOUR NEXT FAVORITE</span><h2>{{ is3d ? '探索新维度' : '发现下一份快乐' }} <span>{{ games.length.toString().padStart(2, '0') }}</span></h2></div><label class="search-box"><Search :size="16"/><input v-model="search" aria-label="搜索游戏" placeholder="找个好玩的…"/></label></div>
        <div v-if="catalogError" class="notice" role="alert">游戏目录加载失败。<button @click="loadCatalog">重新加载</button><details><summary>错误详情</summary>{{ catalogError }}</details></div>
        <div v-else-if="!catalog" class="notice" role="status">正在加载游戏目录…</div>
        <div v-else-if="!games.length" class="notice">没有找到匹配的游戏，换个关键词试试。</div>
        <div v-else class="game-grid">
          <button v-for="(game,index) in games" :key="game.id" class="game-card" :class="[game.accent, {soon: game.status === 'coming-soon'}]" :disabled="game.status === 'coming-soon'" @click="openGame(game)">
            <div class="game-cover"><span class="cover-index">{{ String(index + 1).padStart(2,'0') }} / {{ dimension.toUpperCase() }}</span><img :src="game.icon" alt=""/><span class="cover-label">{{ game.status === 'coming-soon' ? 'COMING SOON' : '可玩原型' }}</span><span class="cover-action"><ExternalLink v-if="game.openMode === 'new-tab'" :size="16"/><ArrowUpRight v-else :size="18"/></span></div>
            <div class="game-info"><div class="game-title"><h3>{{ game.name }}</h3><span>{{ game.category }}</span></div><p>{{ game.description }}</p><div class="game-tags"><span v-for="tag in game.tags" :key="tag">{{ tag }}</span><span v-if="game.status === 'coming-soon'">筹备中</span><ArrowRight v-else :size="15"/></div></div>
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
