import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // BR-02/BR-22: il motore normativo richiede copertura completa (NFR-MAINT-01).
    coverage: { provider: 'v8', include: ['src/**'], thresholds: { lines: 95, branches: 90 } },
  },
});
