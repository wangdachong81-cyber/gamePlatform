import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/games-2d': { target: 'http://127.0.0.1:5174', changeOrigin: true },
      '/games-3d': { target: 'http://127.0.0.1:5175', changeOrigin: true },
    },
  },
});
