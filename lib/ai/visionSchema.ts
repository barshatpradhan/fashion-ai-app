import { z } from 'zod';
import { NAMED_STYLES, GENERIC_TAGS } from '@/lib/domain/vocabulary';

export class VisionParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VisionParseError';
  }
}

// The vision step must not emit history or origin claims.
const BANNED_KEYS = new Set(['history', 'origin']);

const clamp01 = z.number().transform((n) => Math.min(1, Math.max(0, n)));

const namedStyleSet = new Set<string>(NAMED_STYLES);
const tagSet = new Set<string>([...NAMED_STYLES, ...GENERIC_TAGS]);

export const visionSchema = z
  .object({
    is_garment: z.boolean(),
    garment_type: z.string(),
    category: z.enum(['top', 'bottom', 'dress', 'outerwear', 'accessory', 'other']),
    parts: z
      .record(z.string(), z.string())
      .default({})
      .transform((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !BANNED_KEYS.has(k.toLowerCase())))),
    pattern: z.string().default(''),
    colors: z.array(z.object({ name: z.string(), hex: z.string() }).strip()).default([]),
    fabric_guess: z
      .object({
        value: z.string(),
        confidence: clamp01,
        alternatives: z.array(z.string()).default([]),
      })
      .strip(),
    condition_notes: z.string().default(''),
    visible_techniques: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]).transform((t) => t.filter((x) => tagSet.has(x))),
    named_styles: z
      .array(z.object({ style: z.string(), confidence: clamp01 }).strip())
      .default([])
      .transform((arr) => arr.filter((s) => namedStyleSet.has(s.style))),
  })
  .strip();

export type VisionResult = Omit<z.infer<typeof visionSchema>, 'named_styles'> & {
  named_styles: { style: (typeof NAMED_STYLES)[number]; confidence: number }[];
};

export function parseVision(raw: unknown): VisionResult {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (cause) {
      throw new VisionParseError('Vision output is not valid JSON', { cause });
    }
  }
  const res = visionSchema.safeParse(data);
  if (!res.success) throw new VisionParseError(`Vision output failed schema: ${res.error.message}`, { cause: res.error });
  return res.data as VisionResult;
}
