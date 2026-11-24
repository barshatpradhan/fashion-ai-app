import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { adminClient } from '@/lib/db/admin';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { loadProfile } from '@/lib/db/profile';
import { accountView } from '@/lib/auth/account';
import { runProfileUpdate } from '@/lib/auth/profileUpdate';

const noStore = { 'cache-control': 'no-store' };

export async function GET() {
  try {
    const supabase = await serverClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return NextResponse.json({ error: SCAN_ERRORS.unauthorized }, { status: 401 });
    const [profile, name] = await Promise.all([
      loadProfile(data.user.id),
      adminClient().from('profiles').select('display_name').eq('id', data.user.id).maybeSingle(),
    ]);
    if (name.error) throw new Error(`display name read failed: ${name.error.message}`);
    const account = accountView(data.user, (name.data?.display_name as string | null) ?? null);
    return NextResponse.json({ ...profile, account }, { headers: noStore });
  } catch (err) {
    console.error('profile load failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}

/** Accepts only { display_name } and always writes the caller's own row. */
export async function PATCH(request: Request) {
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
    const result = await runProfileUpdate(data.user.id, input, {
      async setDisplayName(userId, name) {
        const { error } = await adminClient().from('profiles').update({ display_name: name }).eq('id', userId);
        if (error) throw new Error(`display name update failed: ${error.message}`);
      },
    });
    return NextResponse.json(result.body, { status: result.status, headers: noStore });
  } catch (err) {
    console.error('profile update failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
