import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('scan and result layout', () => {
  it('ResultView uses a wide details column and a four-up recipes grid', () => {
    const src = read('components/ResultView.tsx');
    expect(src).toContain('ui.grid4');
    expect(src).toContain('ui.colWide');
  });

  it('scan page uses a side intro column', () => {
    expect(read('app/scan/page.tsx')).toContain('ui.colSide');
  });
});
