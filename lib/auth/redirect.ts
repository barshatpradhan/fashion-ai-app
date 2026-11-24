/** Redirect safety for ?next= and email links: only same-origin relative paths, never an arbitrary URL. */

const PROBE_ORIGIN = 'http://next.invalid';

/**
 * Returns `raw` as a path + query on this origin, or `fallback`. Rejects absolute and protocol-relative
 * URLs, backslashes and encoded slashes (which some browsers normalise into `//host`), control characters
 * and the auth callback itself (no redirect loops).
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/closet'): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw) || /%(2f|5c)/i.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith('/auth/callback')) return fallback;
  return url.pathname + url.search;
}

/** Paths the middleware refreshes the session on: everything except static assets and the cron job. */
export function isSessionRefreshPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/cron')) return false;
  return !/\.(?:ico|png|jpe?g|gif|webp|avif|svg|woff2?|txt|xml|webmanifest)$/i.test(pathname);
}
