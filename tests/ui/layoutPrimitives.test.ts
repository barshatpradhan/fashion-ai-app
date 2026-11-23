import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ui = read('components/ui.module.css');
const globals = read('app/globals.css');

describe('layout primitives', () => {
  it.each(['cols', 'colSide', 'colWide', 'grid2', 'grid3', 'grid4', 'panel', 'headRow', 'imgSlot'])(
    'ui.module.css defines .%s',
    (name) => {
      expect(ui).toMatch(new RegExp(String.raw`\.${name}\s*[{,]`));
    },
  );

  it('is mobile-first with tablet and desktop media queries', () => {
    expect(ui).toContain('@media (min-width: 768px)');
    expect(ui).toContain('@media (min-width: 1200px)');
  });

  it('globals.css carries the v3.1 tokens, light scheme and reduced motion', () => {
    expect(globals).toContain('--slate: #263645');
    expect(globals).toContain('--signal: #E8FF5A');
    expect(globals).toContain('--paper: #FFFFFF');
    expect(globals).toContain('color-scheme: light');
    expect(globals).toContain('prefers-reduced-motion');
  });
});
