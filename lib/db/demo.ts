import 'server-only';
import { timingSafeEqual, createHash } from 'node:crypto';

/** Constant-time check of the hidden demo key. An empty expected key never matches. */
export function demoKeyMatches(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export const DEMO_EMAIL = 'demo@revivo.local';
