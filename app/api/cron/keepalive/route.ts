import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/db/admin';

/** Daily Vercel cron: a trivial query so the free Supabase project is never paused for inactivity. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { error } = await adminClient().from('profiles').select('id').limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('keepalive failed', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
