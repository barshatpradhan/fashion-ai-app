import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { loadProfile } from '@/lib/db/profile';

export async function GET() {
  try {
    const supabase = await serverClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return NextResponse.json({ error: SCAN_ERRORS.unauthorized }, { status: 401 });
    return NextResponse.json(await loadProfile(data.user.id), { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('profile load failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
