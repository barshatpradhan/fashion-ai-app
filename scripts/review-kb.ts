import { adminClient } from '@/lib/db/admin';
import { reviewBlocker } from '@/lib/kb/importRows';

async function main() {
  const [slug, reviewer] = process.argv.slice(2);
  if (!slug || !reviewer?.trim()) throw new Error('Usage: npm run kb:review -- <slug> "<reviewer name>"');
  const db = adminClient();
  const { data, error } = await db.from('kb_entries').select('kind, sources').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  const blocker = reviewBlocker(data);
  if (blocker) throw new Error(`Refusing to review "${slug}": ${blocker}`);
  const { error: upErr } = await db.from('kb_entries').update({ status: 'reviewed', reviewed_by: reviewer.trim() }).eq('slug', slug);
  if (upErr) throw new Error(upErr.message);
  console.log(`"${slug}" marked reviewed by ${reviewer.trim()}.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
