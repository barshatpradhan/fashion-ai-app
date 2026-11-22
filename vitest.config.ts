import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // server-only throws outside Next's react-server condition; stub it for tests.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  // tsconfig keeps jsx: preserve for Next; tests need the automatic runtime transform.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
