import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');

// Regression: browser extensions (Grammarly and others) add attributes to <html> and <body> before React
// hydrates, which logged a hydration-mismatch console error on every page. Suppression is one level deep,
// so mismatches inside the page are still reported.
describe('root layout hydration', () => {
  it('ignores extension-injected attributes on <html> and <body> only', () => {
    expect(layout).toMatch(/<html[^>]*\bsuppressHydrationWarning\b/);
    expect(layout).toMatch(/<body[^>]*\bsuppressHydrationWarning\b/);
    expect(layout.match(/suppressHydrationWarning/g)).toHaveLength(2);
  });
});
