import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  build: {
    target: 'esnext',
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
