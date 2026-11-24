import type { KbEntry, MatchResult } from '@/lib/domain/types';

/** A Premium Recipe as sent to a user without access: no body, steps, tools or sources. */
export type LockedRecipe = {
  id: string;
  kind: 'redesign';
  title: string;
  difficulty?: KbEntry['difficulty'];
  teaser: string;
};

/** The match as it leaves the API: recipes other than the free one may be locked. */
export type PublicMatch = Omit<MatchResult, 'recipes'> & { recipes: (KbEntry | LockedRecipe)[] };

export const isLockedRecipe = (r: KbEntry | LockedRecipe): r is LockedRecipe => !('body' in r);

/** First sentence of a body; used as the teaser of a locked Recipe. */
export function firstSentence(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}

export function lockRecipe(r: KbEntry): LockedRecipe {
  return {
    id: r.id,
    kind: 'redesign',
    title: r.title,
    ...(r.difficulty ? { difficulty: r.difficulty } : {}),
    teaser: firstSentence(r.body),
  };
}

/**
 * Server-side redaction shared by /api/analyze and /api/correct. Users with full access (premium or
 * demo) get every Recipe; everyone else gets full data only for `freeRecipeId`.
 */
export function redactMatch(match: MatchResult, fullAccess: boolean): PublicMatch {
  if (fullAccess) return match;
  return { ...match, recipes: match.recipes.map((r) => (r.id === match.freeRecipeId ? r : lockRecipe(r))) };
}
