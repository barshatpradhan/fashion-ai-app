/** Profile writes a user may make about themselves: their display name, nothing else. */

export const DISPLAY_NAME_MAX = 60;

// Control characters, zero-width and bidi-override characters: invisible or misleading in a name.
const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff],
];
const isInvisible = (s: string) =>
  [...s].some((ch) => { const c = ch.codePointAt(0)!; return INVISIBLE_RANGES.some(([a, b]) => c >= a && c <= b); });

export type NameCheck = { ok: true; value: string } | { ok: false; error: 'required' | 'too_long' | 'invalid' };

/** Trimmed, inner whitespace collapsed, 1-60 characters (code points, matching Postgres char_length). */
export function normalizeDisplayName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'required' };
  if (isInvisible(raw)) return { ok: false, error: 'invalid' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, error: 'required' };
  if ([...value].length > DISPLAY_NAME_MAX) return { ok: false, error: 'too_long' };
  return { ok: true, value };
}

export interface ProfileWriteRepo {
  setDisplayName(userId: string, name: string): Promise<void>;
}

export type ProfileUpdateResult =
  | { status: 200; body: { displayName: string } }
  | { status: 400; body: { error: string } };

/**
 * PATCH /api/profile. Accepts exactly `{ display_name }`: any other key (is_premium, is_demo, credits, an id)
 * is refused outright rather than ignored, so a crafted request can never change more than the name.
 */
export async function runProfileUpdate(userId: string, input: unknown, repo: ProfileWriteRepo): Promise<ProfileUpdateResult> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 400, body: { error: 'bad_request' } };
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== 'display_name') return { status: 400, body: { error: 'bad_request' } };
  const check = normalizeDisplayName((input as { display_name: unknown }).display_name);
  if (!check.ok) return { status: 400, body: { error: check.error } };
  await repo.setDisplayName(userId, check.value);
  return { status: 200, body: { displayName: check.value } };
}
