/**
 * One-off asset generator for the home ring: nine original, AI-made people seen from above, each
 * wearing one of the nine second lives. Writes public/home-ring/<slug>.webp, trimmed, on pure white.
 * The model cannot output transparency, so the ring blends each figure with mix-blend-mode: multiply:
 * white drops out against the stage and the soft floor shadow stays.
 * Skips figures that already exist; pass --force to redo all, or slugs to redo some.
 *   npm run gen:ring            npm run gen:ring -- denim-tote bucket-hat
 *   npm run gen:ring -- --swatches    (the fabric swatches shown in the pieces strip; skips existing)
 *   npm run gen:ring -- --reprocess   (redo trimming/whitening from the cached raw images, no API calls)
 * Uses OPENAI_API_KEY from .env and the same image model as Concept images.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import { OPENAI_IMAGE_MODEL } from '@/lib/ai/imageGen';
import { SECOND_LIVES, FABRICS, figureSlug, type Fabric } from '@/components/secondLives';

const OUT = path.join(process.cwd(), 'public', 'home-ring');
/** Raw model output, kept so --reprocess can redo the finishing without paying again (git-ignored). */
const RAW = path.join(process.cwd(), '.cache', 'home-ring');
const HEIGHT = 720;

/** Who wears each piece, in SECOND_LIVES order. Original people; varied ages, builds and backgrounds. */
const PEOPLE = [
  'a young East Asian woman with a black bob, holding a paperback book',
  'a Black man in his thirties with short twists, one hand in a pocket',
  'a South Asian woman in her twenties with long wavy hair, holding a takeaway coffee',
  'a red-haired white man in his twenties with a short beard, holding a phone',
  'a Latina woman in her forties with a low bun, holding a folded newspaper',
  'a young Southeast Asian man with messy black hair, holding a film camera',
  'a Black woman in her twenties with short natural hair, holding a small notebook',
  'an older white man in his sixties with grey hair, hands relaxed at his sides',
  'a Middle Eastern woman in her thirties with curly dark hair, holding a phone',
];

/**
 * A whole outfit of visibly remade clothes, led by the second life itself. Every piece shows how it was
 * reworked (raw hems, spliced panels, patchwork, visible mending, contrast topstitching), so the ring
 * reads as upcycling at a glance rather than ordinary new clothes.
 */
const OUTFITS = [
  'a blue-and-white striped cotton shirt cropped short and tied in a knot at the front waist, with the cut-off sleeve fabric re-sewn as a contrast collar; wide black trousers reworked with a spliced panel of grey wool down each leg and visible white running-stitch seams; white canvas sneakers',
  'a tote bag sewn from old light-blue jeans with the back pockets and waistband kept, on one shoulder; a cream jumper with elbows mended in visible red sashiko stitching; olive trousers with a raw cropped hem and a patched knee in faded denim; brown boots',
  'a lilac linen wrap skirt made from a man\'s shirt, the button placket running down the side and the cuffs turned into ties; a white tank top cut from an old tee with a raw neckline; flat sandals',
  'a mustard-yellow patchwork scarf sewn from squares of old t-shirt jersey in mustard, rust and cream; a grey sweatshirt with contrast patchwork elbow panels; dark jeans with a raw hem and a patched knee; black sneakers',
  'a charcoal blazer cut down into a cropped jacket with a raw fraying hem and contrast topstitching; a white tee with a hand-dyed indigo pocket added; wide grey trousers spliced from two different checked wools; black loafers',
  'tan chino cut-off shorts with a frayed hem and patch pockets made from a striped shirt; a navy tee with a cropped raw hem and visible mending at the shoulder; white socks; brown loafers',
  'a sage-green apron dress made from an oversized shirt, buttons down the back and the collar reworked into straps; a white tee with spliced lilac sleeve panels underneath; white sneakers',
  'a steel-blue denim bucket hat sewn from an old denim jacket, seams and rivets showing; a black hoodie with denim patch pockets and visible white stitching; khaki trousers with a spliced denim panel at the knee; dark brown boots',
  'a rust-orange racer-back tank top cut from a faded t-shirt with a raw scooped neckline; light-wash straight jeans reworked with a contrast patchwork panel on one thigh and frayed hems; white sneakers',
];

function prompt(i: number): string {
  return `Photorealistic overhead street-style photo. The camera is about three metres up, looking steeply down at ${PEOPLE[i]}, who stands on the ground and looks up at the camera with a calm, natural expression. The whole body is visible from head to shoes, with strong top-down foreshortening: head and shoulders large, legs and feet small.
They wear ${OUTFITS[i]}. True-to-life fabric texture, soft natural daylight.
Seamless pure white (#FFFFFF) studio floor and background with only a soft, small contact shadow under the feet; no other objects. No text, no logos, no brand marks. An original person, not a celebrity or a known model.`;
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function makeOne(client: OpenAI, i: number): Promise<void> {
  const slug = figureSlug(SECOND_LIVES[i].name);
  const file = path.join(OUT, `${slug}.webp`);
  const res = await client.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt: prompt(i),
    size: '1024x1536',
    quality: 'medium',
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${slug}: no image returned`);
  const raw = Buffer.from(b64, 'base64');
  await writeFile(path.join(RAW, `${slug}.png`), raw);
  await writeFile(file, await finish(raw));
  console.log(`${slug}: done`);
}

/**
 * The model paints an off-white backdrop. Sample the four corners, scale every channel so that
 * backdrop becomes pure white (it then vanishes under multiply), trim it, and save a small WebP.
 */
export async function finish(raw: Buffer): Promise<Buffer> {
  const flat = await sharp(raw).flatten({ background: '#ffffff' }).removeAlpha().toBuffer();
  const { width = 0, height = 0 } = await sharp(flat).metadata();
  const c = 24;
  const corners = [[0, 0], [width - c, 0], [0, height - c], [width - c, height - c]];
  const means = await Promise.all(corners.map(async ([left, top]) =>
    (await sharp(flat).extract({ left, top, width: c, height: c }).stats()).channels.map((ch) => ch.mean)));
  const gain = [0, 1, 2].map((k) => Math.min(1.25, 255 / Math.max(1, ...means.map((m) => m[k]))));
  const white = await sharp(flat).linear(gain, [0, 0, 0]).toBuffer();
  return sharp(white)
    .trim({ background: '#ffffff', threshold: 6 })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#ffffff' })
    .resize({ height: HEIGHT, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

/** One macro texture per fabric named in the ring's pieces (FABRICS in components/secondLives.ts). */
const SWATCH_SIZE = 96;
const SWATCH_PROMPTS: Record<Fabric, string> = {
  denim: 'mid-blue cotton denim with a visible diagonal twill weave',
  'striped-cotton': 'blue-and-white striped cotton shirting',
  'chino-twill': 'tan cotton chino twill',
  linen: 'natural oatmeal linen with visible slubby yarns',
  jersey: 'heather-grey cotton t-shirt jersey knit',
  'wool-flannel': 'charcoal brushed wool flannel',
  'wool-check': 'grey and black small-check wool suiting',
  knit: 'cream chunky wool knit with ribbed stitches',
  fleece: 'grey cotton sweatshirt fleece, the loopback side',
  poplin: 'sage-green cotton poplin',
};

async function makeSwatch(client: OpenAI, f: Fabric): Promise<void> {
  const file = path.join(OUT, `fabric-${f}.webp`);
  const res = await client.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt: `Macro close-up photo of ${SWATCH_PROMPTS[f]}, lying flat and filling the entire frame edge to edge. Even, soft daylight; true-to-life texture and colour. No folds, no edges, no objects, no text.`,
    size: '1024x1024',
    quality: 'low',
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${f}: no image returned`);
  const raw = Buffer.from(b64, 'base64');
  await writeFile(path.join(RAW, `fabric-${f}.png`), raw);
  // Centre crop: the middle of a macro shot is the sharpest, most even texture.
  await writeFile(file, await sharp(raw).extract({ left: 256, top: 256, width: 512, height: 512 })
    .resize(SWATCH_SIZE, SWATCH_SIZE).webp({ quality: 80 }).toBuffer());
  console.log(`fabric-${f}: done`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));
  await mkdir(OUT, { recursive: true });
  await mkdir(RAW, { recursive: true });
  if (args.includes('--swatches')) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const todo: Fabric[] = [];
    for (const f of FABRICS) if (force || !(await exists(path.join(OUT, `fabric-${f}.webp`)))) todo.push(f);
    for (let k = 0; k < todo.length; k += 4) {
      const results = await Promise.allSettled(todo.slice(k, k + 4).map((f) => makeSwatch(client, f)));
      for (const r of results) if (r.status === 'rejected') console.error(String(r.reason?.message ?? r.reason));
    }
    return;
  }
  if (args.includes('--reprocess')) {
    for (const l of SECOND_LIVES) {
      const slug = figureSlug(l.name);
      const src = path.join(RAW, `${slug}.png`);
      if (await exists(src)) { await writeFile(path.join(OUT, `${slug}.webp`), await finish(await readFile(src))); console.log(`${slug}: reprocessed`); }
    }
    return;
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const todo: number[] = [];
  for (let i = 0; i < SECOND_LIVES.length; i++) {
    const slug = figureSlug(SECOND_LIVES[i].name);
    if (only.length && !only.includes(slug)) continue;
    if (!force && !only.length && (await exists(path.join(OUT, `${slug}.webp`)))) continue;
    todo.push(i);
  }
  // Three at a time: fast enough, and gentle on rate limits.
  for (let k = 0; k < todo.length; k += 3) {
    const results = await Promise.allSettled(todo.slice(k, k + 3).map((i) => makeOne(client, i)));
    for (const r of results) if (r.status === 'rejected') console.error(String(r.reason?.message ?? r.reason));
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
