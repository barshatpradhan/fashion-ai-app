import 'server-only';
import { adminClient } from '@/lib/db/admin';
import { adminCreditRepo, type CreditRepo } from '@/lib/db/credits';
import { peek, displayTier as display } from '@/lib/domain/allowance';
import { PRICE_LABEL } from '@/lib/db/premium';
import { sortActivity, type ActivityView } from '@/lib/ui/profile';
import type { AllowanceOut } from '@/lib/db/closet';

export type ProfileView = {
  isPremium: boolean; isDemo: boolean; price: string;
  allowance: { uploads: AllowanceOut; looks: AllowanceOut };
  activity: ActivityView[];
};

const out = (a: ReturnType<typeof peek>): AllowanceOut => ({
  remaining: a.remaining, nextCreditAt: a.nextCreditAt ? a.nextCreditAt.toISOString() : null,
});

export async function loadProfile(
  userId: string, credits: CreditRepo = adminCreditRepo(), now: Date = new Date(),
): Promise<ProfileView> {
  const db = adminClient();
  const [up, look, act] = await Promise.all([
    credits.read(userId, 'upload'),
    credits.read(userId, 'look'),
    db.from('activity').select('id, kind, created_at, garments(name)').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (act.error) throw new Error(`activity read failed: ${act.error.message}`);
  const rows = (act.data ?? []) as unknown as {
    id: string; kind: ActivityView['kind']; created_at: string;
    garments: { name: string | null } | { name: string | null }[] | null;
  }[];
  const activity = sortActivity(rows.map((r) => {
    const g = Array.isArray(r.garments) ? r.garments[0] : r.garments;
    return { id: r.id, kind: r.kind, garmentName: g?.name ?? null, createdAt: r.created_at };
  }));
  return {
    isPremium: up.tier.premium, isDemo: up.tier.exempt, price: PRICE_LABEL,
    allowance: { uploads: out(peek(up.state, now, display(up.tier))), looks: out(peek(look.state, now, display(look.tier))) },
    activity,
  };
}
