import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('looks layout', () => {
  const css = read('components/looks.module.css');
  it('puts the runway on a soft rounded stage', () => {
    const stage = css.match(/\.stage\s*\{[^}]*\}/)?.[0] ?? '';
    expect(stage).toContain('border-radius: var(--radius-lg)');
    expect(stage).toContain('background: var(--surface-soft)');
  });
  it('has a tablet breakpoint, mobile-first', () => {
    expect(css).toContain('@media (min-width: 768px)');
  });
  it('page uses the shared head row and no page-level brand line', () => {
    const src = read('app/looks/page.tsx');
    expect(src).toContain('ui.headRow');
    expect(src).not.toContain('ui.brand');
  });
  it('carousel splits into wide and side columns', () => {
    const src = read('components/LooksCarousel.tsx');
    expect(src).toContain('ui.cols');
    expect(src).toContain('ui.colWide');
    expect(src).toContain('ui.colSide');
  });
});
