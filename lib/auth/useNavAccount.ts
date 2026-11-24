'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { browserClient } from '@/lib/db/browser';

export type NavAccount =
  | { state: 'unknown' }
  | { state: 'guest' }
  | { state: 'account'; name: string; initial: string };

/** Fired by the profile page after the display name changes, so the nav updates without a reload. */
export const PROFILE_UPDATED_EVENT = 'revivo:profile-updated';

/**
 * Who is browsing, for the nav: a guest (anonymous or no session yet) or an account with its display
 * name. Never starts a session itself, and shows nothing until it knows (no Log in flash).
 */
export function useNavAccount(): NavAccount {
  const [account, setAccount] = useState<NavAccount>({ state: 'unknown' });

  useEffect(() => {
    let sb: ReturnType<typeof browserClient>;
    try {
      sb = browserClient();
    } catch {
      return; // no Supabase config (tests, misconfigured env): keep the nav neutral
    }
    let alive = true;
    const load = async (user: User | null) => {
      if (!user || user.is_anonymous) {
        if (alive) setAccount({ state: 'guest' });
        return;
      }
      const { data } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      const name = (data?.display_name as string | null) || 'Profile';
      const initial = ([...(data?.display_name as string | null ?? user.email ?? 'P')][0] ?? 'P').toUpperCase();
      if (alive) setAccount({ state: 'account', name, initial });
    };
    const refresh = () => { void sb.auth.getUser().then(({ data }) => load(data.user)); };

    refresh();
    // Supabase advises against awaiting its calls inside this callback, so defer the profile read.
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { void load(session?.user ?? null); }, 0);
    });
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
    };
  }, []);

  return account;
}
