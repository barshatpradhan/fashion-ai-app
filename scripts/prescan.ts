/**
 * Warms demo_cache and the image-hash cache before a presentation.
 *   npm run prescan -- ./stage-photos
 * For every photo: upload under the demo user, run the analyze service, then the free Recipe's guide
 * and concept image. Calls the service functions directly (not HTTP). Needs DEMO_USER_ID and real keys.
 */
import { getEnv } from '@/lib/env';
import { runAnalyze, defaultAnalyzeDeps } from '@/lib/db/scans';
import { runGuide, runRender, defaultGuideDeps } from '@/lib/db/guides';
import { photosIn, uploadOriginal } from '@/lib/demo/upload';

async function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error('usage: npm run prescan -- <photo-folder>');
  const userId = getEnv().DEMO_USER_ID;
  const analyzeDeps = defaultAnalyzeDeps();
  const guideDeps = defaultGuideDeps();
  let ok = 0;
  const names = photosIn(folder);
  for (const name of names) {
    try {
      const { imagePath, cutoutPath } = await uploadOriginal(userId, folder, name);
      const a = await runAnalyze(userId, { imagePath, cutoutPath, imageHash: 'prescan' }, analyzeDeps);
      if (a.status !== 200) { console.warn(`${name}: analyze -> ${a.status} ${a.body.error}`); continue; }
      const recipeId = a.body.match.freeRecipeId;
      if (!recipeId) { console.log(`${name}: analyzed (no free Recipe to warm)`); ok++; continue; }
      const input = { scanId: a.body.scanId, recipeId };
      const g = await runGuide(userId, input, guideDeps);
      const r = g.status === 200 ? await runRender(userId, input, guideDeps) : null;
      console.log(`${name}: analyze 200, guide ${g.status}, render ${r ? r.status : 'skipped'}`);
      if (g.status === 200 && r?.status === 200) ok++;
    } catch (e) {
      console.warn(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Prescan finished: ${ok}/${names.length} photos fully warmed.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
