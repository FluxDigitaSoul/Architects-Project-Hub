import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compila i decoratori con i metadata richiesti dalla dependency injection di NestJS.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
