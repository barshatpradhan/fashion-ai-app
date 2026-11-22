import { parse } from 'csv-parse/sync';
import { NAMED_STYLES, GENERIC_TAGS } from '@/lib/domain/vocabulary';

export const KB_COLUMNS = ['id', 'kind', 'title', 'body', 'tags', 'difficulty', 'tools', 'steps', 'sources'] as const;
export type KbCsvRow = Record<(typeof KB_COLUMNS)[number], string>;

const KINDS = ['history', 'redesign', 'fabric'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const named = new Set<string>(NAMED_STYLES);
const allowed = new Set<string>([...NAMED_STYLES, ...GENERIC_TAGS]);

export function splitList(s: string): string[] {
  return (s ?? '').split('|').map((x) => x.trim()).filter(Boolean);
}

export function parseKbCsv(text: string): KbCsvRow[] {
  const records = parse(text, { columns: true, skip_empty_lines: true, trim: false, bom: true }) as Record<string, string>[];
  return records.map((r) => {
    const out = {} as KbCsvRow;
    for (const c of KB_COLUMNS) out[c] = (r[c] ?? '').toString();
    return out;
  });
}

type Source = { citation: string; url: string; accessed: string };

/** Returns the parsed sources, or an error string. */
function parseSources(raw: string): { sources: Source[] } | { error: string } {
  if (!raw.trim()) return { sources: [] };
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { error: 'sources is not valid JSON' }; }
  if (!Array.isArray(v)) return { error: 'sources must be a JSON array' };
  for (const [i, s] of v.entries()) {
    const o = s as Partial<Source> | null;
    if (!o || typeof o.citation !== 'string' || !o.citation.trim()) return { error: `sources[${i}] needs a citation` };
    if (typeof o.accessed !== 'string' || !o.accessed.trim()) return { error: `sources[${i}] needs an accessed date` };
    if (typeof o.url !== 'string' || !/^https?:\/\/\S+$/i.test(o.url)) return { error: `sources[${i}] needs an http(s) url` };
  }
  return { sources: v as Source[] };
}

export function validateRow(row: KbCsvRow): string[] {
  const errors: string[] = [];
  if (!row.id.trim()) errors.push('id is required');
  if (!row.title.trim()) errors.push('title is required');
  if (!KINDS.includes(row.kind)) errors.push(`kind must be one of ${KINDS.join('|')} (got "${row.kind}")`);

  for (const t of splitList(row.tags)) {
    if (t !== t.toLowerCase()) errors.push(`tag "${t}" must be lowercase`);
    else if (!allowed.has(t)) errors.push(`tag "${t}" is not in the vocabulary`);
    else if (row.kind === 'history' && !named.has(t)) errors.push(`history tag "${t}" must be a Named Style`);
  }

  if (row.kind === 'redesign') {
    if (!DIFFICULTIES.includes(row.difficulty)) errors.push(`redesign difficulty must be one of ${DIFFICULTIES.join('|')}`);
    if (splitList(row.steps).length === 0) errors.push('redesign steps must not be empty');
  }

  const parsed = parseSources(row.sources);
  if ('error' in parsed) errors.push(parsed.error);
  else if (row.kind === 'history' && parsed.sources.length === 0) errors.push('history sources must be a non-empty JSON array');
  if (row.kind === 'history' && splitList(row.tags).length === 0) errors.push('history needs at least one Named Style tag');
  return errors;
}

/** Row as written to kb_entries. Always a draft; reviewed_by is deliberately absent. */
export function toDbRow(row: KbCsvRow) {
  const parsed = parseSources(row.sources);
  const steps = splitList(row.steps);
  const tools = splitList(row.tools);
  return {
    slug: row.id.trim(),
    kind: row.kind,
    title: row.title.trim(),
    body: row.body || null,
    tags: splitList(row.tags),
    difficulty: row.difficulty || null,
    tools: tools.length ? tools.join(', ') : null, // stored as comma text; readers split on ','
    steps: steps.length ? steps : null,
    sources: 'sources' in parsed && parsed.sources.length ? parsed.sources : null,
    status: 'draft' as const,
  };
}

/** Validates every row first; writes nothing if any row is bad. */
export async function importRows(
  rows: KbCsvRow[],
  upsert: (dbRows: ReturnType<typeof toDbRow>[]) => Promise<void>,
): Promise<number> {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) problems.push(`${r.id}: duplicate id in file`);
    seen.add(r.id);
    for (const e of validateRow(r)) problems.push(`${r.id || '(no id)'}: ${e}`);
  }
  if (problems.length) throw new Error(`KB import refused:\n${problems.join('\n')}`);
  await upsert(rows.map(toDbRow));
  return rows.length;
}

/** Why a row may not be marked reviewed, or null if it may. */
export function reviewBlocker(entry: { kind: string; sources: unknown } | null): string | null {
  if (!entry) return 'unknown slug';
  if (entry.kind === 'history') {
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) return 'history entry has no sources; add a verifiable source or drop the entry';
  }
  return null;
}
