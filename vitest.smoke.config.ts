import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Live-service smoke tests. Loads .env.local (vitest does not) and FAILS loudly when the Supabase
// variables are missing: a silent skip would look like a pass on the demo-day checklist.
const envFile = path.resolve(__dirname, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(
    `test:smoke needs a live Supabase project: set ${missing.join(', ')} in .env.local (not skipping).`,
  );
}

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
