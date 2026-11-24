/**
 * Account flows on top of Supabase Auth, behind a small port so they can be tested without a network.
 * Passwords only ever go to Supabase Auth; nothing here stores, logs or echoes them, and provider error
 * text never reaches the screen (it can reveal whether an account exists).
 */

export type PortUser = { id: string; email?: string | null; new_email?: string | null; is_anonymous?: boolean };
type ProviderError = { status?: number; code?: string; message?: string } | null;

export interface AuthPort {
  getUser(): Promise<PortUser | null>;
  updateUser(
    attrs: { email?: string; password?: string },
    options?: { emailRedirectTo?: string },
  ): Promise<{ user: PortUser | null; error: ProviderError }>;
  signUp(input: { email: string; password: string; emailRedirectTo: string }): Promise<{ hasSession: boolean; error: ProviderError }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{ error: ProviderError }>;
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: ProviderError }>;
  /** PATCH /api/profile; false on failure (the name can be set later, so it never blocks sign-up). */
  saveDisplayName(name: string): Promise<boolean>;
}

export const PASSWORD_MIN = 8;
export const LOGIN_ERROR = 'That email and password do not match. Try again or reset your password.';
const RATE_LIMITED = 'Too many attempts. Wait a minute and try again.';
const GENERIC = 'Something went wrong. Please try again.';
const LINK_EXPIRED = 'This link has expired or was already used. Ask for a new one.';

export type Rule = { id: 'length'; label: string; met: boolean };
export function passwordRules(password: string): Rule[] {
  return [{ id: 'length', label: `At least ${PASSWORD_MIN} characters`, met: password.length >= PASSWORD_MIN }];
}
const passwordProblem = (pw: string) => (pw.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : null);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type SignupFields = { email: string; password: string; confirm: string; displayName: string };
export type FieldErrors = Partial<Record<keyof SignupFields, string>>;

export function validateSignup(f: SignupFields): FieldErrors {
  const e: FieldErrors = {};
  if (!EMAIL.test(f.email.trim())) e.email = 'Enter a valid email address.';
  const pw = passwordProblem(f.password);
  if (pw) e.password = pw;
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match.';
  if (!f.displayName.trim()) e.displayName = 'Enter a name to show on your profile.';
  return e;
}

/** Where an email link returns to: always our own callback, with a same-origin next path. */
export const callbackUrl = (origin: string, next: string) => `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

const isRateLimit = (e: ProviderError) => e?.status === 429 || /rate_limit/.test(e?.code ?? '');

export type SignUpResult =
  | { kind: 'done' }
  | { kind: 'check_email' }
  | { kind: 'already_signed_in' }
  | { kind: 'error'; field: 'email' | 'password' | null; message: string };

function signUpError(e: ProviderError): SignUpResult {
  if (isRateLimit(e)) return { kind: 'error', field: null, message: RATE_LIMITED };
  if (e?.code === 'weak_password') return { kind: 'error', field: 'password', message: 'Choose a stronger password.' };
  if (e?.code && /email|user_already_exists/.test(e.code)) {
    return { kind: 'error', field: 'email', message: "We couldn't use that email. If you already have an account, log in instead." };
  }
  return { kind: 'error', field: null, message: GENERIC };
}

/**
 * Sign-up. A guest (anonymous user) is converted in place, so their closet, scans and looks stay theirs:
 * updateUser({ email }) first; the password is set once the email is verified (Supabase's documented
 * order for anonymous users). If the project applies the email at once (no confirmation), the password
 * is set straight away. Only a visitor with no session at all gets a brand-new user.
 */
export async function signUp(
  input: { email: string; password: string; displayName: string }, port: AuthPort, origin: string,
): Promise<SignUpResult> {
  const email = input.email.trim();
  const redirect = callbackUrl(origin, '/signup/complete');
  const user = await port.getUser();

  if (!user) {
    const r = await port.signUp({ email, password: input.password, emailRedirectTo: redirect });
    if (r.error) return signUpError(r.error);
    if (input.displayName.trim()) await port.saveDisplayName(input.displayName);
    return r.hasSession ? { kind: 'done' } : { kind: 'check_email' };
  }
  if (!user.is_anonymous) return { kind: 'already_signed_in' };

  // Before the email step, while this session is certainly still the guest's.
  await port.saveDisplayName(input.displayName);
  const linked = await port.updateUser({ email }, { emailRedirectTo: redirect });
  if (linked.error) return signUpError(linked.error);

  const applied = linked.user?.email?.toLowerCase() === email.toLowerCase() && !linked.user?.new_email;
  if (!applied) return { kind: 'check_email' };
  const pw = await port.updateUser({ password: input.password });
  return pw.error ? signUpError(pw.error) : { kind: 'done' };
}

export async function logIn(email: string, password: string, port: AuthPort): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await port.signInWithPassword({ email: email.trim(), password });
    if (!error) return { ok: true };
    return { ok: false, message: isRateLimit(error) ? RATE_LIMITED : LOGIN_ERROR };
  } catch {
    return { ok: false, message: LOGIN_ERROR };
  }
}

/** Always "sent": the answer must not reveal whether an account exists. */
export async function requestPasswordReset(email: string, port: AuthPort, origin: string): Promise<'sent'> {
  try {
    await port.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl(origin, '/reset-password') });
  } catch {
    // Same answer either way.
  }
  return 'sent';
}

export type PasswordResult = { ok: true } | { ok: false; field: 'current' | 'next' | null; message: string };

function passwordUpdateError(e: ProviderError): PasswordResult {
  if (e?.code === 'same_password') return { ok: false, field: 'next', message: 'Choose a password you have not used here before.' };
  if (e?.code === 'weak_password') return { ok: false, field: 'next', message: 'Choose a stronger password.' };
  if (isRateLimit(e)) return { ok: false, field: null, message: RATE_LIMITED };
  return { ok: false, field: null, message: GENERIC };
}

/** Profile password change: re-authenticate with the current password, then set the new one. */
export async function changePassword(current: string, next: string, port: AuthPort): Promise<PasswordResult> {
  const problem = passwordProblem(next);
  if (problem) return { ok: false, field: 'next', message: problem };
  const user = await port.getUser();
  if (!user?.email || user.is_anonymous) return { ok: false, field: null, message: GENERIC };
  const check = await port.signInWithPassword({ email: user.email, password: current });
  if (check.error) {
    return isRateLimit(check.error)
      ? { ok: false, field: null, message: RATE_LIMITED }
      : { ok: false, field: 'current', message: 'Your current password is not right.' };
  }
  const r = await port.updateUser({ password: next });
  return r.error ? passwordUpdateError(r.error) : { ok: true };
}

/** Reset page and sign-up completion: the email link has signed this browser in as the account. */
export async function setNewPassword(next: string, port: AuthPort): Promise<PasswordResult> {
  const problem = passwordProblem(next);
  if (problem) return { ok: false, field: 'next', message: problem };
  const user = await port.getUser();
  if (!user || user.is_anonymous) return { ok: false, field: null, message: LINK_EXPIRED };
  const r = await port.updateUser({ password: next });
  return r.error ? passwordUpdateError(r.error) : { ok: true };
}

export type LogOutDeps = {
  signOut(options?: { scope: 'local' }): Promise<{ error: ProviderError }>;
  /** Forget the memoised user id in ensureSession(). */
  resetSession(): void;
  /** ensureSession(): a fresh anonymous guest, so the app keeps working after logging out. */
  startGuest(): Promise<string>;
};

/** Sign out everywhere (falling back to this browser when offline), then continue as a new guest. */
export async function logOut(deps: LogOutDeps): Promise<void> {
  const { error } = await deps.signOut();
  if (error) await deps.signOut({ scope: 'local' });
  deps.resetSession();
  await deps.startGuest();
}
