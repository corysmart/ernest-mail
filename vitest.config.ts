import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/*.e2e.test.ts'],
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
