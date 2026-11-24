import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/db/server';
import { runAuthCallback } from '@/lib/auth/callback';

/** Email links (sign-up confirmation, password reset, email change) land here. */
export async function GET(request: Request) {
  const supabase = await serverClient();
  const target = await runAuthCallback(new URL(request.url), {
    exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
    verifyOtp: (params) => supabase.auth.verifyOtp(params),
  });
  return NextResponse.redirect(target);
}
