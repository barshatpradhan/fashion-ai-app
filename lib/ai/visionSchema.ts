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

export const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'accessory', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

const namedStyleSet = new Set<string>(NAMED_STYLES);
const tagSet = new Set<string>([...NAMED_STYLES, ...GENERIC_TAGS]);

// ---- Lenient coercion: models drift on case, nulls and nesting; a first live scan must not fail on that.

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const lc = (v: string) => v.trim().toLowerCase();

/** Strings and numbers become trimmed strings; anything else becomes ''. */
const text = z.unknown().transform((v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''));

/** A list of strings: null/non-array -> [], non-string items dropped. */
const stringList = z.unknown().transform((v) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);

const confidence = z.unknown().transform((v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
});

/** Vocabulary lookup tolerant of case, padding and spaces instead of hyphens ("Breton Stripe"). */
function inVocab(raw: string, vocab: Set<string>): string | null {
  const v = lc(raw);
  if (vocab.has(v)) return v;
  const hyphen = v.replace(/\s+/g, '-');
  return vocab.has(hyphen) ? hyphen : null;
}

/** A part value as one short string: primitives as-is, flat lists/objects joined, deeper nesting dropped. */
function partText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const items = Array.isArray(v) ? v : isObj(v) ? Object.values(v) : null;
  if (!items) return null;
  const flat = items.filter((x) => typeof x === 'string' || typeof x === 'number').map((x) => String(x).trim()).filter(Boolean);
  return flat.length ? flat.join(', ') : null;
}

const booleanish = z.preprocess(
  (v) => (typeof v === 'string' && ['true', 'false'].includes(lc(v)) ? lc(v) === 'true' : v),
  z.boolean(),
);

export const visionSchema = z
  .object({
    is_garment: booleanish,
    garment_type: text,
    category: z.unknown().transform((v): Category => {
      const c = typeof v === 'string' ? lc(v) : '';
      return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : 'other';
    }),
    parts: z.unknown().transform((p) => {
      if (!isObj(p)) return {} as Record<string, string>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(p)) {
        if (BANNED_KEYS.has(k.toLowerCase())) continue;
        const t = partText(v);
        if (t) out[k] = t;
      }
      return out;
    }),
    pattern: text,
    colors: z.unknown().transform((v) => {
      if (!Array.isArray(v)) return [] as { name: string; hex: string }[];
      return v.flatMap((c) => {
        if (typeof c === 'string' && c.trim()) return [{ name: c.trim(), hex: '' }];
        if (isObj(c) && typeof c.name === 'string' && c.name.trim()) {
          return [{ name: c.name.trim(), hex: typeof c.hex === 'string' ? c.hex.trim() : '' }];
        }
        return [];
      });
    }),
    fabric_guess: z.unknown().transform((v) => {
      const f = isObj(v) ? v : {};
      return {
        value: typeof f.value === 'string' ? lc(f.value) : '',
        confidence: confidence.parse(f.confidence),
        alternatives: stringList.parse(f.alternatives).map(lc),
      };
    }),
    condition_notes: text,
    visible_techniques: stringList,
    tags: z.unknown().transform((v) => {
      const out: string[] = [];
      for (const t of stringList.parse(v)) {
        const hit = inVocab(t, tagSet);
        if (hit && !out.includes(hit)) out.push(hit);
      }
      return out;
    }),
    named_styles: z.unknown().transform((v) => {
      if (!Array.isArray(v)) return [] as { style: string; confidence: number }[];
      return v.flatMap((s) => {
        if (!isObj(s) || typeof s.style !== 'string') return [];
        const style = inVocab(s.style, namedStyleSet);
        return style ? [{ style, confidence: confidence.parse(s.confidence) }] : [];
      });
    }),
  })
  .strip();

export type VisionResult = Omit<z.infer<typeof visionSchema>, 'named_styles'> & {
  named_styles: { style: (typeof NAMED_STYLES)[number]; confidence: number }[];
};

/** JSON Schema sent to Gemini (responseJsonSchema) so the model returns the right shape in the first place. */
export const VISION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_garment: { type: 'boolean' },
    garment_type: { type: 'string' },
    category: { type: 'string', enum: [...CATEGORIES] },
    parts: { type: 'object', additionalProperties: { type: 'string' } },
    pattern: { type: 'string' },
    colors: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, hex: { type: 'string' } }, required: ['name', 'hex'] },
    },
    fabric_guess: {
      type: 'object',
      properties: {
        value: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        alternatives: { type: 'array', items: { type: 'string' } },
      },
      required: ['value', 'confidence', 'alternatives'],
    },
    condition_notes: { type: 'string' },
    visible_techniques: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string', enum: [...tagSet] } },
    named_styles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { style: { type: 'string', enum: [...NAMED_STYLES] }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['style', 'confidence'],
      },
    },
  },
  required: [
    'is_garment', 'garment_type', 'category', 'parts', 'pattern', 'colors', 'fabric_guess',
    'condition_notes', 'visible_techniques', 'tags', 'named_styles',
  ],
} as const;

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
