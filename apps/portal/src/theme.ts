import { ref } from 'vue';
import gsap from 'gsap';
import type { Dimension } from '@youxi/contracts';

const initial: Dimension = new URLSearchParams(window.location.search).get('world') === '3d' ? '3d' : '2d';
export const dimension = ref<Dimension>(initial);
const palettes = {
  '2d': { '--page': '#101a19', '--surface': '#172422', '--surface-raised': '#1e302b', '--ink': '#f2f6e8', '--muted': '#a1b5a9', '--accent': '#d4f68a', '--secondary': '#f2b873', '--line': '#30453c', '--glow': '#33533a' },
  '3d': { '--page': '#111222', '--surface': '#1b1d35', '--surface-raised': '#292b49', '--ink': '#f5f1ff', '--muted': '#aaa9c9', '--accent': '#bca3ff', '--secondary': '#74ddeb', '--line': '#383953', '--glow': '#40335e' },
};
let root: HTMLElement | undefined;
export function initTheme(element: HTMLElement) {
  root = element;
  gsap.set(root, palettes[dimension.value]);
}
export function selectDimension(next: Dimension) {
  if (next === dimension.value) return;
  dimension.value = next;
  const url = new URL(window.location.href);
  url.searchParams.set('world', next);
  window.history.replaceState(window.history.state, '', url);
  if (!root) return;
  gsap.to(root, { ...palettes[next], duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : .85, ease: 'power2.inOut', overwrite: 'auto' });
}
