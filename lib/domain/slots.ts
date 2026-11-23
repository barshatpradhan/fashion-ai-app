/** Normalised 0-1 box in a figure's frame. (Also defined by the avatar plan's Task 1.) */
export type Box = { x: number; y: number; w: number; h: number };

export type Slot = 'top' | 'outer' | 'bottom' | 'one-piece' | 'shoes' | 'accessory';
export type Dot = { x: number; y: number };

/** Where each slot sits on a front-facing figure. */
export const SLOT_BOX: Record<Slot, Box> = {
  top: { x: 0.28, y: 0.22, w: 0.44, h: 0.3 },
  outer: { x: 0.2, y: 0.2, w: 0.6, h: 0.38 },
  bottom: { x: 0.3, y: 0.48, w: 0.4, h: 0.44 },
  'one-piece': { x: 0.26, y: 0.22, w: 0.48, h: 0.68 },
  shoes: { x: 0.3, y: 0.89, w: 0.4, h: 0.1 },
  accessory: { x: 0.4, y: 0.04, w: 0.2, h: 0.12 },
};

const RULES: [Slot, RegExp][] = [
  ['one-piece', /\b(dress|jumpsuit|romper|gown|overalls?|playsuit)\b/i],
  ['outer', /\b(jacket|coat|blazer|cardigan|parka|trench|vest|gilet|hoodie|bomber)\b/i],
  ['bottom', /\b(trousers?|pants|jeans|skirt|shorts|leggings|chinos|culottes)\b/i],
  ['shoes', /\b(shoes?|sneakers?|boots?|sandals?|loafers?|heels?|flats|trainers?|mules?)\b/i],
];

export function slotFor(category: 'clothing' | 'accessory', text: string): Slot {
  if (category === 'accessory') return 'accessory';
  for (const [slot, re] of RULES) if (re.test(text)) return slot;
  return 'top';
}

export function lookKey(garmentIds: string[]): string {
  return [...garmentIds].sort().join(',');
}

export function dollLayout(pieces: { id: string; slot: Slot }[]): Record<string, Box> {
  const seen: Partial<Record<Slot, number>> = {};
  const out: Record<string, Box> = {};
  for (const p of pieces) {
    const n = seen[p.slot] ?? 0;
    seen[p.slot] = n + 1;
    const b = SLOT_BOX[p.slot];
    out[p.id] = { ...b, x: b.x + n * 0.08 };
  }
  return out;
}

const clamp = (v: number) => Math.min(0.96, Math.max(0.04, v));

export function resolveDots(
  pieces: { id: string; slot: Slot }[],
  located: Record<string, Box> | null,
): Record<string, Dot> {
  const layout = dollLayout(pieces);
  const out: Record<string, Dot> = {};
  for (const p of pieces) {
    const b = (located && located[p.id]) || layout[p.id];
    out[p.id] = { x: clamp(b.x + b.w / 2), y: clamp(b.y + b.h / 2) };
  }
  return out;
}
