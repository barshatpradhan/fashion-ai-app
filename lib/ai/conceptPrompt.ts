import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

/**
 * The Concept-image brief, built only from data already stored (the scan's reading and the recipe's
 * `result` line): no extra AI call. With the photo, the model edits this garment; without it (photo
 * deleted, or a provider without image input), it draws it from the same description.
 */

const DETAIL = /print|graphic|logo|text|letter|embroider|motif|pattern|stripe|check|plaid|floral|appliqu/i;
const PLAIN = /^(solid|plain|none|)$/i;
const DETAIL_TAGS = new Set(['graphic', 'stripes', 'plaid', 'checks', 'floral', 'polka-dot', 'animal-print', 'embroidery']);

/** What the scan saw printed, woven or embroidered on the garment, in its own words. */
export function printDetails(v: VisionResult): string[] {
  const parts = Object.values(v.parts ?? {}).filter((p) => DETAIL.test(p));
  const pattern = v.pattern && !PLAIN.test(v.pattern.trim()) && !parts.some((p) => p.includes(v.pattern)) ? [v.pattern] : [];
  return [...parts, ...pattern];
}

/** High input fidelity costs more: use it only when there is lettering, a logo or a pattern to keep. */
export function needsHighFidelity(v: VisionResult): boolean {
  return printDetails(v).length > 0 || v.tags.some((t) => DETAIL_TAGS.has(t)) || v.named_styles.length > 0;
}

const colourList = (v: VisionResult) =>
  v.colors.map((c) => (c.hex ? `${c.name} (#${c.hex.replace(/^#/, '').toUpperCase()})` : c.name)).join(', ');

export function conceptPrompt(v: VisionResult, recipe: KbEntry, opts: { withPhoto: boolean }): string {
  const finished = recipe.result?.trim() || `${recipe.title}. ${recipe.body}`.trim();
  const fabric = v.fabric_guess.value || 'fabric';
  const colours = colourList(v);
  const details = printDetails(v);

  const lines = [
    opts.withPhoto
      ? `Edit the garment in the photo to show it after this redesign: ${finished}`
      : `A ${fabric} ${v.garment_type} after this redesign: ${finished}`,
    `Keep it recognisably the same piece: the same ${fabric}${colours ? `, the same colours (${colours})` : ''} and the same fabric texture.`,
  ];
  if (details.length) {
    lines.push(
      `Keep the print exactly as ${opts.withPhoto ? 'it is in the photo' : 'described'}: ${details.join('; ')}. Same lettering, colours, size and position. ` +
      'Do not move, redraw, restyle or invent any graphic or text; where the redesign cuts through the print, simply trim it.',
    );
  } else {
    lines.push('Do not add any print, graphic or text.');
  }
  lines.push(
    'Show only the finished piece, flat and front-facing, as a clean product photo on a plain off-white background. ' +
    'No people, no mannequin, no hands, no added text or labels.',
  );
  return lines.join('\n');
}
