import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { runAnalyze, defaultAnalyzeDeps } from '@/lib/db/scans';

export async function POST(request: Request) {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const result = await runAnalyze(data.user.id, input, defaultAnalyzeDeps());
  return NextResponse.json(result.body, { status: result.status });
}
