import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sausage-conquest/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
});
