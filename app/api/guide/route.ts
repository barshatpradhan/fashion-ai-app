import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { runGuide, defaultGuideDeps } from '@/lib/db/guides';

/** AI call inside: allow up to 60 s on the host (the AI timeouts stay shorter). */
export const maxDuration = 60;

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
    const result = await runGuide(data.user.id, input, defaultGuideDeps());
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('guide failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
