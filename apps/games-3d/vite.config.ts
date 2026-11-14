import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: '/games-3d/', plugins: [react()], server: { cors: true, hmr: { clientPort: 5175 } } });
