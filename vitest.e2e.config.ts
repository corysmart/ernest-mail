import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    setupFiles: ['tests/e2e/setup.ts'],
    globals: true,
    environment: 'node',
    teardownTimeout: 5000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
