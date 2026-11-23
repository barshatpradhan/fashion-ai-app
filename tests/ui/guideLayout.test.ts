import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('guide layout', () => {
  const css = read('components/guide.module.css');
  it('has a 3D flip card with hidden backfaces', () => {
    expect(css).toContain('backface-visibility: hidden');
    expect(css).toContain('rotateY(180deg)');
  });
  it('turns the flip transition off for reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.flip[\s\S]*transition: none/);
  });
  it('page uses two columns and no page-level brand line', () => {
    const src = read('app/guide/[scanId]/[recipeId]/page.tsx');
    expect(src).toContain('ui.cols');
    expect(src).not.toContain('ui.brand');
  });

  it('back link comes before the columns and the hidden face is aria-hidden (source check, page not rendered)', () => {
    const src = read('app/guide/[scanId]/[recipeId]/page.tsx');
    const ready = src.slice(src.indexOf("load.kind === 'ready'"));
    expect(ready.indexOf('{back}')).toBeLessThan(ready.indexOf('ui.cols'));
    expect(src).toContain('aria-hidden={conceptShown || undefined}');
    expect(src).toContain('aria-hidden={!conceptShown || undefined}');
    expect(src).toContain('inert={conceptShown || undefined}');
    expect(src).toContain('inert={!conceptShown || undefined}');
    expect(read('components/guide.module.css')).toContain('overflow-x: clip');
  });
});
