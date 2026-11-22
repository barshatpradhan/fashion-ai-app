import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry, Confirmed, MatchResult } from '@/lib/domain/types';

export type { KbEntry, Confirmed, MatchResult };

const HISTORY_CONFIDENCE = 0.8;
const QUESTION_CONFIDENCE = 0.5;
const MAX_RECIPES = 4;

const lc = (s: string) => s.toLowerCase();

/** Stable ranking by overlap with `scanTags`; zero overlap excluded. */
function rank(entries: KbEntry[], scanTags: Set<string>): KbEntry[] {
  return entries
    .map((e, i) => ({ e, i, n: [...new Set(e.tags.map(lc))].filter((t) => scanTags.has(t)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.e);
}

export function matchEntries(v: VisionResult, c: Confirmed, entries: KbEntry[]): MatchResult {
  const empty: MatchResult = { history: [], recipes: [], fabricNotes: [], freeRecipeId: null, styleQuestions: [] };
  if (v.category === 'accessory') return empty;

  const reviewed = entries.filter((e) => e.status === 'reviewed');
  const fabric = c.fabric ?? v.fabric_guess.value;
  const garmentType = c.garmentType ?? v.garment_type;
  const scanTags = new Set([...v.tags, fabric, garmentType].map(lc));

  const rejected = new Set((c.rejectedStyles ?? []).map(lc));
  const confirmed = new Set(c.namedStyles.map(lc));
  const qualifying = new Set<string>(confirmed);
  const styleQuestions: MatchResult['styleQuestions'] = [];
  for (const s of v.named_styles) {
    const name = lc(s.style);
    if (rejected.has(name)) continue;
    if (s.confidence >= HISTORY_CONFIDENCE) qualifying.add(name);
    else if (s.confidence >= QUESTION_CONFIDENCE && !confirmed.has(name)) {
      styleQuestions.push({ style: s.style, confidence: s.confidence });
    }
  }
  for (const r of rejected) qualifying.delete(r);

  const history = rank(reviewed.filter((e) => e.kind === 'history'), qualifying);
  // Free Recipe (§6.6 rule 5): best-matching beginner from the FULL ranked list, else the best of any level.
  const ranked = rank(reviewed.filter((e) => e.kind === 'redesign'), scanTags);
  const free = ranked.find((r) => r.difficulty === 'beginner') ?? ranked[0];
  const recipes = ranked.slice(0, MAX_RECIPES);
  // A beginner ranked below the cap is swapped in as the last shown Recipe so the free one is always shown.
  if (free && !recipes.includes(free)) recipes[recipes.length - 1] = free;
  const fabricNotes = rank(reviewed.filter((e) => e.kind === 'fabric'), scanTags);

  return { history, recipes, fabricNotes, freeRecipeId: free?.id ?? null, styleQuestions };
}
