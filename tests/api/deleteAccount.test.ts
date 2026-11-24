import { describe, it, expect, vi } from 'vitest';
import { runDeleteAccount, type DeleteAccountRepo } from '@/lib/auth/deleteAccount';

const ME = { id: 'user-1', is_anonymous: false };

function repo(files: string[] = ['a.jpg', 'a-cutout.png'], over: Partial<DeleteAccountRepo> = {}) {
  const r: DeleteAccountRepo = {
    isDemo: vi.fn(async () => false),
    listObjects: vi.fn(async (_prefix: string, offset: number, limit: number) => files.slice(offset, offset + limit)),
    removeObjects: vi.fn(async () => {}),
    deleteUser: vi.fn(async () => {}),
    ...over,
  };
  return r;
}

describe('runDeleteAccount', () => {
  it('deletes the caller: their Storage files under <id>/, then the auth user', async () => {
    const r = repo();
    expect(await runDeleteAccount(ME, { confirm: 'DELETE' }, r)).toEqual({ status: 200, body: { deleted: true } });
    expect(r.listObjects).toHaveBeenCalledWith('user-1', 0, 100);
    expect(r.removeObjects).toHaveBeenCalledWith(['user-1/a.jpg', 'user-1/a-cutout.png']);
    expect(r.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('removes every page of files, not just the first 100', async () => {
    const files = Array.from({ length: 230 }, (_, i) => `f${i}.jpg`);
    const r = repo(files);
    await runDeleteAccount(ME, { confirm: 'DELETE' }, r);
    const removed = (r.removeObjects as ReturnType<typeof vi.fn>).mock.calls.flatMap((c) => c[0] as string[]);
    expect(removed).toHaveLength(230);
    expect(new Set(removed).size).toBe(230);
    expect(removed.every((p) => p.startsWith('user-1/'))).toBe(true);
  });

  it.each([
    [{ confirm: 'DELETE', userId: 'victim' }],
    [{ confirm: 'DELETE', id: 'victim' }],
    [{ confirm: 'DELETE', email: 'victim@example.test' }],
  ])('refuses a request that names any target user: %j', async (input) => {
    const r = repo();
    expect(await runDeleteAccount(ME, input, r)).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(r.deleteUser).not.toHaveBeenCalled();
    expect(r.removeObjects).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ confirm: 'delete' }], [{ confirm: 'yes' }], [null], ['DELETE']])('needs the typed word DELETE: %j', async (input) => {
    const r = repo();
    expect(await runDeleteAccount(ME, input, r)).toEqual({ status: 400, body: { error: 'confirm_required' } });
    expect(r.deleteUser).not.toHaveBeenCalled();
  });

  it('a guest has no account to delete', async () => {
    const r = repo();
    expect(await runDeleteAccount({ id: 'g', is_anonymous: true }, { confirm: 'DELETE' }, r)).toEqual({ status: 403, body: { error: 'account_required' } });
    expect(r.deleteUser).not.toHaveBeenCalled();
  });

  it('the demo account is protected', async () => {
    const r = repo([], { isDemo: vi.fn(async () => true) });
    expect(await runDeleteAccount(ME, { confirm: 'DELETE' }, r)).toEqual({ status: 403, body: { error: 'demo_protected' } });
    expect(r.deleteUser).not.toHaveBeenCalled();
  });

  it('if the files cannot be removed, the account is kept (so a retry can finish the job)', async () => {
    const r = repo(['a.jpg'], { removeObjects: vi.fn(async () => { throw new Error('storage down'); }) });
    await expect(runDeleteAccount(ME, { confirm: 'DELETE' }, r)).rejects.toThrow('storage down');
    expect(r.deleteUser).not.toHaveBeenCalled();
  });
});
