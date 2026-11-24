import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Routes that wait on an AI provider. A live scan took ~21 s locally; without an explicit maxDuration a
// deployment's default function limit can cut the request off mid-call.
describe.each(['analyze', 'guide', 'outfits', 'render'])('/api/%s', (route) => {
  it('declares maxDuration = 60', () => {
    const src = readFileSync(join(process.cwd(), `app/api/${route}/route.ts`), 'utf8');
    expect(src).toMatch(/export const maxDuration = 60;/);
  });
});
