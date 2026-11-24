import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { adminClient } from '@/lib/db/admin';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { runDeleteAccount } from '@/lib/auth/deleteAccount';

const BUCKET = 'garments';

/** Deletes the signed-in account: its photos, then the auth user (rows cascade), then the session cookie. */
export async function POST(request: Request) {
  try {
    const supabase = await serverClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return NextResponse.json({ error: SCAN_ERRORS.unauthorized }, { status: 401 });
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: SCAN_ERRORS.badRequest }, { status: 400 });
    }

    const admin = adminClient();
    const result = await runDeleteAccount(data.user, input, {
      async isDemo(userId) {
        const { data: p, error } = await admin.from('profiles').select('is_demo').eq('id', userId).maybeSingle();
        if (error) throw new Error(`profile read failed: ${error.message}`);
        return p?.is_demo === true;
      },
      async listObjects(prefix, offset, limit) {
        const { data: items, error } = await admin.storage.from(BUCKET).list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw new Error(`storage list failed: ${error.message}`);
        return (items ?? []).filter((i) => i.id !== null).map((i) => i.name);
      },
      async removeObjects(paths) {
        const { error } = await admin.storage.from(BUCKET).remove(paths);
        if (error) throw new Error(`storage remove failed: ${error.message}`);
      },
      async deleteUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw new Error(`user delete failed: ${error.message}`);
      },
    });
    if (result.status === 200) {
      // The user no longer exists: clear this browser's session cookie (the browser then starts a new guest).
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('account delete failed', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
