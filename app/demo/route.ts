import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { adminClient } from '@/lib/db/admin';
import { serverClient } from '@/lib/db/server';
import { demoKeyMatches } from '@/lib/db/demo';

const notFound = () => new NextResponse('Not found', { status: 404 });

/** Hidden presenter sign-in: GET /demo?key=… signs this browser in as the demo user, then goes home. */
export async function GET(request: Request) {
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch {
    return notFound();
  }
  const key = new URL(request.url).searchParams.get('key');
  if (!demoKeyMatches(key, env.DEMO_KEY)) return notFound();

  try {
    const admin = adminClient();
    const { data: user, error: userErr } = await admin.auth.admin.getUserById(env.DEMO_USER_ID);
    const email = user?.user?.email;
    if (userErr || !email) throw new Error('demo user missing or has no email (run npm run seed:demo)');
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) throw new Error(`could not create demo sign-in: ${linkErr?.message ?? 'no token'}`);
    const supabase = await serverClient();
    const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (error) throw new Error(`demo sign-in failed: ${error.message}`);
    return NextResponse.redirect(new URL('/', request.url));
  } catch (err) {
    console.error('demo sign-in failed', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
