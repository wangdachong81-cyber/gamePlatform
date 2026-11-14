<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Gamepad2, ArrowUpRight } from '@lucide/vue';
import { dimension, initTheme } from './theme';
const shell = ref<HTMLElement>();
onMounted(() => { if (shell.value) initTheme(shell.value); });
</script>

<template>
  <div ref="shell" class="platform" :data-world="dimension">
    <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <div class="site-wrap">
      <header class="site-header">
        <RouterLink to="/" class="brand"><span class="brand-icon"><Gamepad2 :size="22"/></span><span>游隙<span class="brand-en">PLAYVERSE</span></span></RouterLink>
        <div class="header-right"><span class="online-dot"></span><span>打开浏览器，进入游戏世界</span><ArrowUpRight :size="17"/></div>
      </header>
      <RouterView v-slot="{ Component, route }"><component :is="Component" :key="route.path"/></RouterView>
      <footer class="site-footer"><span>游隙 · 给生活留一点好玩的空隙</span><span>2D / 3D · ALL IN YOUR BROWSER</span></footer>
    </div>
  </div>
</template>
