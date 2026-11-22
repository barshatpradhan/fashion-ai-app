import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Live-service smoke tests (need real Supabase env vars; skip cleanly otherwise).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { environment: 'node', include: ['tests/**/*.smoke.ts'] },
});
