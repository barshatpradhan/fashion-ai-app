import { z } from 'zod';

const shape = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  IMAGE_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  DEMO_KEY: z.string().min(1),
  DEMO_USER_ID: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  /** Image generation (gpt-image-1) routinely exceeds the text timeout; stays under the route's 60 s maxDuration. */
  RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(50000),
});

export type Env = z.infer<typeof shape>;
export type EnvKey = keyof Env;

function openaiRule(v: Partial<Env>, ctx: z.RefinementCtx) {
  if (v.IMAGE_PROVIDER === 'openai' && !v.OPENAI_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['OPENAI_API_KEY'],
      message: 'OPENAI_API_KEY is required when IMAGE_PROVIDER is openai',
    });
  }
}

function validate<T>(schema: z.ZodType<T>, raw: Record<string, string | undefined>): T {
  // Treat empty strings (e.g. blank lines in .env) as unset.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) cleaned[k] = v === '' ? undefined : v;
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }
  return result.data;
}

/** Full validation: every variable the running app needs. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  return validate(shape.superRefine(openaiRule), raw);
}

/**
 * Per-use validation: only the listed keys are required (scripts such as kb:import or seed:demo must not
 * demand AI or demo keys they never use). Asking for IMAGE_PROVIDER also checks OPENAI_API_KEY when needed.
 */
export function parseEnvFor<K extends EnvKey>(raw: Record<string, string | undefined>, keys: readonly K[]): Pick<Env, K> {
  const pickKeys: EnvKey[] = [...keys];
  if (pickKeys.includes('IMAGE_PROVIDER') && !pickKeys.includes('OPENAI_API_KEY')) pickKeys.push('OPENAI_API_KEY');
  const mask = Object.fromEntries(pickKeys.map((k) => [k, true])) as Record<EnvKey, true>;
  const picked = validate(shape.pick(mask).superRefine(openaiRule), raw) as Partial<Env>;
  // Return only what was asked for (OPENAI_API_KEY may have been added just for the rule).
  return Object.fromEntries(keys.map((k) => [k, picked[k]])) as Pick<Env, K>;
}

let cached: Env | undefined;

/** Lazy, cached access: importing this module never throws. */
export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}

/** Lazy, per-use access: validates only `keys` (served from the full cache when the app already validated it). */
export function getEnvFor<K extends EnvKey>(keys: readonly K[]): Pick<Env, K> {
  return cached ?? parseEnvFor(process.env, keys);
}

/** Lazy proxy: validates on first property access, not on import. */
export const env: Env = new Proxy({} as Env, {
  get: (_t, prop) => getEnv()[prop as keyof Env],
});
