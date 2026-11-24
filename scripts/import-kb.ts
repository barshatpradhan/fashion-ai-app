import { readFileSync } from 'node:fs';
import { adminClient } from '@/lib/db/admin';
import { parseKbCsv, importRows } from '@/lib/kb/importRows';

async function main() {
  const file = process.argv[2] ?? 'content/kb/entries.csv';
  const rows = parseKbCsv(readFileSync(file, 'utf8'));
  const db = adminClient();
  const r = await importRows(rows, {
    fetchExisting: async (slugs) => {
      const { data, error } = await db
        .from('kb_entries').select('slug, kind, title, body, tags, difficulty, tools, steps, sources, result').in('slug', slugs);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    updateResult: async (slug, result) => {
      const { error } = await db.from('kb_entries').update({ result }).eq('slug', slug);
      if (error) throw new Error(error.message);
    },
    upsert: async (dbRows) => {
      const { error } = await db.from('kb_entries').upsert(dbRows, { onConflict: 'slug' });
      if (error) throw new Error(error.message);
    },
  });
  console.log(`${file}: ${r.inserted} inserted, ${r.updated} updated (reset to draft), ${r.unchanged} unchanged, ${r.resultOnly} result lines updated (review kept). Drafts are not shown until reviewed.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
