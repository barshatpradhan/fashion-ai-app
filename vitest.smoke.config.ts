import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Live-service smoke tests (need real Supabase env vars; skip cleanly otherwise).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // server-only throws outside Next's react-server condition; stub it for tests.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.smoke.ts'] },
});
