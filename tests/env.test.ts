import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/lib/env';

const valid = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'gem',
  OPENAI_API_KEY: 'oa',
  DEMO_KEY: 'demo',
  DEMO_USER_ID: '00000000-0000-0000-0000-000000000001',
};

describe('parseEnv', () => {
  it('defaults IMAGE_PROVIDER to gemini and AI_TIMEOUT_MS to 20000', () => {
    const e = parseEnv({ ...valid, IMAGE_PROVIDER: undefined });
    expect(e.IMAGE_PROVIDER).toBe('gemini');
    expect(e.AI_TIMEOUT_MS).toBe(20000);
  });
  it('requires OPENAI_API_KEY when IMAGE_PROVIDER is openai', () => {
    expect(() => parseEnv({ ...valid, IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/);
  });
});
