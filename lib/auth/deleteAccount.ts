/** POST /api/account/delete: a signed-in account deletes itself, and only itself. */

export interface DeleteAccountRepo {
  isDemo(userId: string): Promise<boolean>;
  /** Names of the files directly under `<prefix>/` in the garments bucket, one page at a time. */
  listObjects(prefix: string, offset: number, limit: number): Promise<string[]>;
  removeObjects(paths: string[]): Promise<void>;
  /** Deletes the auth user; profiles, scans, garments, outfits and activity cascade. */
  deleteUser(userId: string): Promise<void>;
}

export type DeleteAccountResult =
  | { status: 200; body: { deleted: true } }
  | { status: 400 | 403; body: { error: string } };

const PAGE = 100;

/**
 * The target is always the session user: a body that names anyone (userId, id, email) is refused rather
 * than ignored. Files go first, so a failure leaves the account in place for a retry instead of orphaning
 * photos with no owner to delete them.
 */
export async function runDeleteAccount(
  user: { id: string; is_anonymous?: boolean }, input: unknown, repo: DeleteAccountRepo,
): Promise<DeleteAccountResult> {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (body && Object.keys(body).some((k) => k !== 'confirm')) return { status: 403, body: { error: 'forbidden' } };
  if (!body || body.confirm !== 'DELETE') return { status: 400, body: { error: 'confirm_required' } };
  if (user.is_anonymous) return { status: 403, body: { error: 'account_required' } };
  if (await repo.isDemo(user.id)) return { status: 403, body: { error: 'demo_protected' } };

  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const names = await repo.listObjects(user.id, offset, PAGE);
    paths.push(...names.map((n) => `${user.id}/${n}`));
    if (names.length < PAGE) break;
  }
  for (let i = 0; i < paths.length; i += PAGE) await repo.removeObjects(paths.slice(i, i + PAGE));

  await repo.deleteUser(user.id);
  return { status: 200, body: { deleted: true } };
}
