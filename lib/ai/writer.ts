import { z } from 'zod';
import { geminiGenerate, GEMINI_TEXT_MODEL } from '@/lib/ai/gemini';
import { AiBadOutputError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry, Garment, StyleProfile } from '@/lib/domain/types';

const guideSchema = z.object({
  steps: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  historyRefs: z.array(z.string()).default([]),
});

async function jsonCall(prompt: string): Promise<unknown> {
  const res = await geminiGenerate({
    model: GEMINI_TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // No thinking: these calls adapt given entries; measured medians 2-5 s vs 10-15 s with it, same validity.
    config: { responseMimeType: 'application/json', temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
  });
  try {
    return JSON.parse(res.text ?? '');
  } catch (cause) {
    throw new AiBadOutputError('Text output is not valid JSON', { cause });
  }
}

export async function writeGuide(
  v: VisionResult,
  recipe: KbEntry,
  history: KbEntry[],
): Promise<{ steps: string[]; tools: string[]; historyRefs: string[] }> {
  const prompt = `Write a short, friendly redesign guide for the garment below using ONLY the given entries.
Rules:
- Do not add any new facts beyond the entries provided.
- Use plain language. No sewing jargon: explain any technique in everyday words.
- Never mention stores, shopping, buying, or brands.
- "historyRefs" must list only ids of the history entries below that you actually used.
Garment: ${JSON.stringify({ type: v.garment_type, pattern: v.pattern, fabric: v.fabric_guess.value, colors: v.colors })}
Recipe entry: ${JSON.stringify({ id: recipe.id, title: recipe.title, body: recipe.body, steps: recipe.steps, tools: recipe.tools })}
History entries: ${JSON.stringify(history.map((h) => ({ id: h.id, title: h.title, body: h.body })))}
Return JSON {"steps": string[], "tools": string[], "historyRefs": string[]}.`;
  const parsed = guideSchema.safeParse(await jsonCall(prompt));
  if (!parsed.success) throw new AiBadOutputError('Guide output failed schema', { cause: parsed.error });
  const allowed = new Set(history.map((h) => h.id));
  return { ...parsed.data, historyRefs: parsed.data.historyRefs.filter((id) => allowed.has(id)) };
}

/** Returns raw JSON; the caller validates it. */
export async function styleLooks(closet: Garment[], profile: StyleProfile, occasion?: string): Promise<unknown> {
  const prompt = `Suggest 3 outfits using ONLY garments from this closet, referencing them by id.
Rules:
- Each outfit uses 2 to 4 different garments.
- If any garment has "upcycled": true, every outfit must include at least one of them.
- Respect the style profile and avoid the listed colors.
- Never mention stores, shopping, buying, brands or links.
- Do NOT make any claim about history, origin, culture, era, decades, designers, or brands. Describe only colours, shapes, layering and the occasion.
Closet: ${JSON.stringify(closet.map((g) => ({ id: g.id, name: g.name, category: g.category, tags: g.tags, upcycled: g.isUpcycled })))}
Style profile: ${JSON.stringify(profile)}
Occasion: ${occasion ?? 'everyday'}
Return JSON {"looks": [{"name": string, "garmentIds": string[], "reason": string}]} where "reason" is one short sentence.`;
  return jsonCall(prompt);
}
