/**
 * Warms the free guide and concept image for the demo account's existing scans.
 *   npm run prescan [-- --scan <scanId>]
 * Day before: sign in via /demo?key=..., upload each stage photo once in /scan (that warms the exact
 * image hash the browser produces), then run this. Calls the service functions directly (not HTTP) as
 * the demo user, so demo_cache is populated. Needs DEMO_USER_ID and real AI keys.
 */
import { getEnvFor } from '@/lib/env';
import { adminClient } from '@/lib/db/admin';
import { runAnalyze, defaultAnalyzeDeps } from '@/lib/db/scans';
import { runGuide, runRender, defaultGuideDeps } from '@/lib/db/guides';
import { pickGarmentScans, scanArg, summaryLine } from '@/lib/demo/prescan';

async function main() {
  const userId = getEnvFor(['DEMO_USER_ID']).DEMO_USER_ID;
  const only = scanArg(process.argv);
  const { data, error } = await adminClient().from('scans').select('id, image_path, cutout_path, vision_json')
    .eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const scans = pickGarmentScans(data ?? [], only);
  const analyzeDeps = defaultAnalyzeDeps();
  const guideDeps = defaultGuideDeps();
  const s = { found: scans.length, guides: 0, images: 0, failures: 0 };
  for (const scan of scans) {
    try {
      // Re-running analyze on the stored bytes hits the hash cache and returns the current match + free recipe id.
      const a = await runAnalyze(userId, { imagePath: scan.image_path, cutoutPath: scan.cutout_path ?? scan.image_path, imageHash: 'x' }, analyzeDeps);
      if (a.status !== 200 || !a.body.match.freeRecipeId) {
        console.warn(`${scan.id}: no free recipe (${a.status})`);
        s.failures++;
        continue;
      }
      const input = { scanId: scan.id, recipeId: a.body.match.freeRecipeId };
      const g = await runGuide(userId, input, guideDeps);
      if (g.status === 200) s.guides++;
      const r = g.status === 200 ? await runRender(userId, input, guideDeps) : null;
      if (r?.status === 200) s.images++;
      if (g.status !== 200 || r?.status !== 200) s.failures++;
      console.log(`${scan.id}: guide ${g.status}, render ${r ? r.status : 'skipped'}`);
    } catch (e) {
      s.failures++;
      console.warn(`${scan.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(summaryLine(s));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
