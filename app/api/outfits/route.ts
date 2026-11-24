import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { runOutfitsAction, defaultOutfitDeps } from '@/lib/db/outfits';

/** AI call inside: allow up to 60 s on the host (the AI timeouts stay shorter). */
export const maxDuration = 60;

async function currentUserId(): Promise<string | null> {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
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
    const result = await runOutfitsAction(userId, input, defaultOutfitDeps());
    return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('outfits action failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
