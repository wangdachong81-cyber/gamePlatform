import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('apps/portal/dist', 'dist', { recursive: true });
for (const app of ['games-2d', 'games-3d']) {
  await cp(`apps/${app}/dist`, `dist/${app}`, { recursive: true });
}
console.log('完整平台已构建到 dist/');
