import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(process.cwd(), 'web'),
  build: {
    outDir: path.resolve(process.cwd(), 'webdist'),
    emptyOutDir: true,
  },
  server: {
    port: 5178,
  },
});
