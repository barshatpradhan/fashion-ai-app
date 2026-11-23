import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const layout = read('app/layout.tsx');

describe('fonts', () => {
  it('loads Oswald from local files, not next/font/google (which intermittently failed to self-host it)', () => {
    expect(layout).not.toMatch(/import\s*\{[^}]*\bOswald\b[^}]*\}\s*from\s*'next\/font\/google'/);
    expect(layout).toMatch(/import localFont from 'next\/font\/local'/);
    expect(layout).toMatch(/localFont\(\{[\s\S]*variable:\s*'--font-oswald'/);
  });
  it('the referenced woff2 file is committed', () => {
    const m = /path:\s*'\.\/(fonts\/[^']+\.woff2)'/.exec(layout);
    expect(m).not.toBeNull();
    expect(existsSync(join(process.cwd(), 'app', m![1]))).toBe(true);
  });
  it('Inter and JetBrains Mono keep their CSS variables', () => {
    expect(layout).toContain("variable: '--font-inter'");
    expect(layout).toContain("variable: '--font-jbmono'");
  });
});
