import { ref, shallowRef } from 'vue';
import { catalogSchema, type Catalog } from '@youxi/contracts';

export const catalog = shallowRef<Catalog>();
export const catalogError = ref('');
let pending: Promise<void> | undefined;
export function loadCatalog(): Promise<void> {
  if (catalog.value) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    catalogError.value = '';
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}config/games.json`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`配置请求失败 (${response.status})`);
      catalog.value = catalogSchema.parse(await response.json());
    } catch (error) {
      catalogError.value = error instanceof Error ? error.message : '游戏配置加载失败';
    } finally { pending = undefined; }
  })();
  return pending;
}
