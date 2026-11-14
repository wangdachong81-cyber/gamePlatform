import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: '/games-2d/', plugins: [react()], server: { cors: true, hmr: { clientPort: 5174 } } });
