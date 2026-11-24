/** What /api/profile tells the page about the caller's account. Never includes the email or tokens. */
export type AccountView = { isGuest: boolean; displayName: string | null; memberSince: string | null };

export function accountView(user: { is_anonymous?: boolean; created_at?: string }, displayName: string | null): AccountView {
  const isGuest = user.is_anonymous === true;
  return { isGuest, displayName: isGuest ? null : displayName, memberSince: isGuest ? null : (user.created_at ?? null) };
}
