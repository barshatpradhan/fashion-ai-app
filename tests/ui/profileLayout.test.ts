import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('profile layout', () => {
  const src = readFileSync('app/profile/page.tsx', 'utf8');
  it('uses the shared grid and panel primitives', () => {
    expect(src).toContain('ui.grid2');
    expect(src).toContain('ui.panel');
  });
});
