import { describe, it, expect, vi } from 'vitest';

const calls: { table: string; patch: unknown; col: string; val: unknown }[] = [];
vi.mock('@/lib/db/admin', () => ({
  adminClient: () => ({
    from: (table: string) => ({
      update: (patch: unknown) => ({
        eq: async (col: string, val: unknown) => { calls.push({ table, patch, col, val }); return { error: null }; },
      }),
    }),
  }),
}));

import { supabaseCorrectionRepo } from '@/lib/db/corrections';

describe('outdateGuides', () => {
  it('marks guides outdated and clears the stored concept image and provider', async () => {
    await supabaseCorrectionRepo().outdateGuides('scan-1');
    expect(calls).toEqual([{
      table: 'guides', col: 'scan_id', val: 'scan-1',
      patch: { outdated: true, after_image_path: null, image_provider: null },
    }]);
  });
});
