import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { SCAN_ERRORS } from '@/lib/db/scans';
import { runRender, defaultGuideDeps } from '@/lib/db/guides';

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
    const result = await runRender(data.user.id, input, defaultGuideDeps());
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('render failed', err);
    return NextResponse.json({ error: SCAN_ERRORS.serverError }, { status: 500 });
  }
}
