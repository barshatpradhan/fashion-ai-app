/** Pure helpers for the Result screen (kept out of components so they are unit-testable). */
import { FABRICS } from '@/lib/domain/vocabulary';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

/** Teaser for a locked Recipe: the first sentence of the body. */
export function firstSentence(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}

/**
 * Fabric choices for the confirm tap: the guess first, then alternatives, deduplicated, limited to the
 * fabric vocabulary (/api/correct rejects anything else) and to three choices.
 */
export function fabricChoices(guess: string, alternatives: string[], max = 3): string[] {
  const allowed = new Set<string>(FABRICS);
  const out: string[] = [];
  for (const raw of [guess, ...alternatives]) {
    const v = raw.trim().toLowerCase();
    if (allowed.has(v) && !out.includes(v)) out.push(v);
    if (out.length === max) break;
  }
  return out;
}

/** "breton-stripe" -> "Breton stripe". */
export function humanize(s: string): string {
  const t = s.replace(/[-_]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function safeHex(hex: string): string | null {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim()) ? hex.trim() : null;
}

/** Only http(s) links are rendered (never javascript: or data: from stored content). */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export type FeatureLabel = { label: string; value: string };

/** Up to `max` short labels describing what the vision step saw. */
export function featureLabels(v: VisionResult, max = 6): FeatureLabel[] {
  const out: FeatureLabel[] = [{ label: 'Type', value: humanize(v.garment_type) }];
  if (v.pattern) out.push({ label: 'Pattern', value: humanize(v.pattern) });
  for (const [part, value] of Object.entries(v.parts)) {
    if (value) out.push({ label: humanize(part), value: humanize(value) });
  }
  for (const t of v.visible_techniques) out.push({ label: 'Technique', value: humanize(t) });
  return out.filter((f) => f.value).slice(0, max);
}

/** History is shown only when it carries at least one linkable source. */
export function verifiedHistory(history: KbEntry[]): KbEntry[] {
  return history.filter((h) => (h.sources ?? []).some((s) => safeUrl(s.url)));
}

export function splitRecipes(recipes: KbEntry[], freeRecipeId: string | null) {
  const free = recipes.find((r) => r.id === freeRecipeId) ?? null;
  return { free, others: recipes.filter((r) => r !== free) };
}
