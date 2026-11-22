import { z } from 'zod';

const schema = z
  .object({
    SUPABASE_URL: z.string().min(1),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
    IMAGE_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
    DEMO_KEY: z.string().min(1),
    DEMO_USER_ID: z.string().min(1),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  })
  .superRefine((v, ctx) => {
    if (v.IMAGE_PROVIDER === 'openai' && !v.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when IMAGE_PROVIDER is openai',
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
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

let cached: Env | undefined;

/** Lazy, cached access: importing this module never throws. */
export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}

/** Lazy proxy: validates on first property access, not on import. */
export const env: Env = new Proxy({} as Env, {
  get: (_t, prop) => getEnv()[prop as keyof Env],
});
