import { describe, it, expect } from 'vitest';
import { parseEnv, parseEnvFor } from '@/lib/env';

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
  it('defaults IMAGE_PROVIDER to gemini, AI_TIMEOUT_MS to 30000 and RENDER_TIMEOUT_MS to 50000', () => {
    const e = parseEnv({ ...valid, IMAGE_PROVIDER: undefined });
    expect(e.IMAGE_PROVIDER).toBe('gemini');
    expect(e.AI_TIMEOUT_MS).toBe(30000);
    expect(e.RENDER_TIMEOUT_MS).toBe(50000);
  });
  it('requires OPENAI_API_KEY when IMAGE_PROVIDER is openai', () => {
    expect(() => parseEnv({ ...valid, IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/);
  });
});

describe('parseEnvFor (per-use validation)', () => {
  const supa = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  it('only requires the keys asked for (seed:demo / kb scripts need no DEMO_* or GEMINI key)', () => {
    const e = parseEnvFor(supa, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    expect(e).toEqual(supa);
  });
  it('still rejects a missing requested key, naming it', () => {
    expect(() => parseEnvFor({ SUPABASE_URL: 'u' }, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it('applies defaults and the openai rule when IMAGE_PROVIDER is requested', () => {
    expect(parseEnvFor({}, ['AI_TIMEOUT_MS', 'RENDER_TIMEOUT_MS'])).toEqual({ AI_TIMEOUT_MS: 30000, RENDER_TIMEOUT_MS: 50000 });
    expect(() => parseEnvFor({ IMAGE_PROVIDER: 'openai' }, ['IMAGE_PROVIDER'])).toThrow(/OPENAI_API_KEY/);
  });
});
