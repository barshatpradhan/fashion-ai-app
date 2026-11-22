/**
 * Creates or updates the demo account and (optionally) fills its closet.
 *   npm run seed:demo [-- --photos ./stage-photos]
 * Prints the user id: put it in DEMO_USER_ID. The account has an email so /demo?key=… can mint a
 * sign-in link for it. Background removal is browser-only, so photos are stored as their own cut-outs.
 */
import { adminClient } from '@/lib/db/admin';
import { DEMO_EMAIL } from '@/lib/db/demo';
import { runClosetAction, defaultClosetDeps } from '@/lib/db/closet';
import { MAX_DEMO_PHOTOS } from '@/lib/demo/photos';
import { photosIn, uploadOriginal } from '@/lib/demo/upload';

const STYLE_PROFILE = {
  styles: ['minimalist', 'streetwear'],
  avoidColors: ['neon'],
  occasions: ['casual', 'work'],
  climate: 'temperate',
};

async function findOrCreateUser(): Promise<string> {
  const admin = adminClient().auth.admin;
  const existingId = process.env.DEMO_USER_ID;
  if (existingId) {
    const { data } = await admin.getUserById(existingId);
    if (data?.user) {
      if (!data.user.email) await admin.updateUserById(existingId, { email: DEMO_EMAIL, email_confirm: true });
      return existingId;
    }
  }
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === DEMO_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await admin.createUser({ email: DEMO_EMAIL, email_confirm: true });
  if (error || !data.user) throw new Error(`could not create demo user: ${error?.message}`);
  return data.user.id;
}

async function main() {
  const flag = process.argv.indexOf('--photos');
  const folder = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (flag >= 0 && !folder) throw new Error('--photos needs a folder');

  const userId = await findOrCreateUser();
  const db = adminClient();
  // The new-user trigger normally creates the profile; upsert covers a user created by hand.
  const { error } = await db.from('profiles')
    .upsert({ id: userId, is_demo: true, is_premium: true, style_profile: STYLE_PROFILE }, { onConflict: 'id' });
  if (error) throw new Error(`profile upsert failed: ${error.message}`);
  console.log(`Demo user ready: ${userId}\nSet DEMO_USER_ID=${userId} in your environment.`);

  if (folder) {
    const { count } = await db.from('garments').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if ((count ?? 0) > 0) {
      console.log(`Closet already has ${count} pieces; skipping photo import (delete them to re-seed).`);
      return;
    }
    const deps = defaultClosetDeps();
    let added = 0;
    for (const name of photosIn(folder, MAX_DEMO_PHOTOS)) {
      const { imagePath, cutoutPath } = await uploadOriginal(userId, folder, name);
      const label = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const r = await runClosetAction(userId, { action: 'quick_add', imagePath, cutoutPath, name: label, tags: [] }, deps);
      if (r.status === 200) added++;
      else console.warn(`${name}: ${JSON.stringify(r.body)}`);
    }
    console.log(`Imported ${added} photos through Quick Add (originals used as cut-outs; background removal runs only in the browser).`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
