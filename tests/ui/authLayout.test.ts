import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression: `${ui.page} ${a.shell}` on <main> let ui.page's max-width win, so the forms stretched
// across a 1440 px screen. The narrow column is an inner wrapper instead.
describe.each(['app/signup/page.tsx', 'app/signup/complete/page.tsx', 'app/login/page.tsx', 'app/forgot-password/page.tsx', 'app/reset-password/page.tsx'])(
  '%s', (file) => {
    it('keeps the form in a narrow inner column', () => {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toContain('${ui.page} ${a.shell}');
      expect(src).toMatch(/<main className=\{ui\.page\}>\s*<div className=\{a\.shell\}>/);
    });
  },
);

// The plan lists used ui.hint (a narrow uppercase caption style), so "1 free recipe per scan" wrapped
// into a cramped column. They use a plain body-text list instead.
describe('SubscriptionPanel lists', () => {
  it('use the plan list style, not the caption hint', () => {
    const src = readFileSync('components/profile/SubscriptionPanel.tsx', 'utf8');
    expect(src).not.toMatch(/<ul className=\{ui\.hint\}>/);
    expect(src).toContain('<ul className={a.planList}>');
    expect(readFileSync('components/auth.module.css', 'utf8')).toMatch(/\.planList \{[^}]*font-family: var\(--font-body\)/);
  });
});
