import { readFileSync } from 'node:fs';
import { adminClient } from '@/lib/db/admin';
import { parseKbCsv, importRows } from '@/lib/kb/importRows';

async function main() {
  const file = process.argv[2] ?? 'content/kb/entries.csv';
  const rows = parseKbCsv(readFileSync(file, 'utf8'));
  const db = adminClient();
  const n = await importRows(rows, async (dbRows) => {
    const { error } = await db.from('kb_entries').upsert(dbRows, { onConflict: 'slug' });
    if (error) throw new Error(error.message);
  });
  console.log(`Imported ${n} rows as drafts from ${file}. Nothing is shown until reviewed.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
