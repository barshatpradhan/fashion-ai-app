import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNextPath } from '@/lib/auth/redirect';

/** The two ways an email link can arrive: a PKCE `code`, or a `token_hash` + `type`. */
export type CallbackAuth = {
  exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
  verifyOtp(params: { token_hash: string; type: EmailOtpType }): Promise<{ error: unknown }>;
};

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * Handles /auth/callback (sign-up confirmation, password reset, email change) and returns the absolute URL
 * to redirect to. Success goes to the same-origin `next` (default /closet); any failure goes to
 * /login?error=link, without echoing the provider's message or any personal data.
 */
export async function runAuthCallback(url: URL, auth: CallbackAuth): Promise<string> {
  const to = (path: string) => new URL(path, url.origin).toString();
  const failed = to('/login?error=link');
  const next = safeNextPath(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  try {
    if (code) {
      const { error } = await auth.exchangeCodeForSession(code);
      return error ? failed : to(next);
    }
    if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
      return error ? failed : to(next);
    }
  } catch {
    return failed;
  }
  return failed;
}
