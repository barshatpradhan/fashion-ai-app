import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isSessionRefreshPath } from '@/lib/auth/redirect';

/**
 * Refreshes the Supabase auth cookie on every page and API request (@supabase/ssr pattern), so a session
 * that expired while the tab was idle is renewed before a route reads it. Never redirects: guests are
 * signed in anonymously by the browser, and pages decide what a guest may do.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSessionRefreshPath(request.nextUrl.pathname)) return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // getUser() validates the token with the Auth server and triggers the refresh; do not remove.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/cron|favicon\\.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|avif|svg|woff2?|txt|xml|webmanifest)$).*)',
  ],
};
