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
});
