import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at closet.memattd.com (custom domain), so the base is the root.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
