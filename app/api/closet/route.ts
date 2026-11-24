import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { runClosetAction, loadCloset, defaultClosetDeps } from '@/lib/db/closet';

async function currentUserId(): Promise<string | null> {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: SCAN_ERRORS.unauthorized }, { status: 401 });
    const result = await loadCloset(userId, defaultClosetDeps());
    return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('closet load failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: SCAN_ERRORS.unauthorized }, { status: 401 });

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: SCAN_ERRORS.badRequest }, { status: 400 });
    }
    const result = await runClosetAction(userId, input, defaultClosetDeps());
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('closet action failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
