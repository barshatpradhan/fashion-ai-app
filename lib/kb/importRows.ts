import { parse } from 'csv-parse/sync';
import { NAMED_STYLES, GENERIC_TAGS } from '@/lib/domain/vocabulary';

/** `result` (optional, last): what the finished piece looks like. Only the Concept-image prompt uses it. */
export const KB_COLUMNS = ['id', 'kind', 'title', 'body', 'tags', 'difficulty', 'tools', 'steps', 'sources', 'result'] as const;
export const RESULT_MAX = 400;
export type KbCsvRow = Record<Exclude<(typeof KB_COLUMNS)[number], 'result'>, string> & { result?: string };

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

/** Shape check for an already-parsed sources value. Null when fine. */
export function sourcesShapeError(v: unknown): string | null {
  if (!Array.isArray(v)) return 'sources must be a JSON array';
  for (const [i, s] of v.entries()) {
    const o = s as Partial<Source> | null;
    if (!o || typeof o.citation !== 'string' || !o.citation.trim()) return `sources[${i}] needs a citation`;
    if (typeof o.accessed !== 'string' || !o.accessed.trim()) return `sources[${i}] needs an accessed date`;
    if (typeof o.url !== 'string' || !/^https?:\/\/\S+$/i.test(o.url)) return `sources[${i}] needs an http(s) url`;
  }
  return null;
}

/** Tag rules shared by import and review. */
export function tagErrors(kind: string, tags: string[]): string[] {
  const errors: string[] = [];
  for (const t of tags) {
    if (t !== t.toLowerCase()) errors.push(`tag "${t}" must be lowercase`);
    else if (!allowed.has(t)) errors.push(`tag "${t}" is not in the vocabulary`);
    else if (kind === 'history' && !named.has(t)) errors.push(`history tag "${t}" must be a Named Style`);
  }
  return errors;
}

/** Returns the parsed sources, or an error string. */
function parseSources(raw: string): { sources: Source[] } | { error: string } {
  if (!raw.trim()) return { sources: [] };
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { error: 'sources is not valid JSON' }; }
  const err = sourcesShapeError(v);
  return err ? { error: err } : { sources: v as Source[] };
}

export function validateRow(row: KbCsvRow): string[] {
  const errors: string[] = [];
  if (!row.id.trim()) errors.push('id is required');
  if (!row.title.trim()) errors.push('title is required');
  if (!KINDS.includes(row.kind)) errors.push(`kind must be one of ${KINDS.join('|')} (got "${row.kind}")`);

  errors.push(...tagErrors(row.kind, splitList(row.tags)));

  if (row.kind === 'redesign') {
    if (!DIFFICULTIES.includes(row.difficulty)) errors.push(`redesign difficulty must be one of ${DIFFICULTIES.join('|')}`);
    if (splitList(row.steps).length === 0) errors.push('redesign steps must not be empty');
  }

  const parsed = parseSources(row.sources);
  if ('error' in parsed) errors.push(parsed.error);
  else if (row.kind === 'history' && parsed.sources.length === 0) errors.push('history sources must be a non-empty JSON array');
  if (row.kind === 'history' && splitList(row.tags).length === 0) errors.push('history needs at least one Named Style tag');
  if ((row.result ?? '').trim().length > RESULT_MAX) errors.push(`result must be ${RESULT_MAX} characters or fewer`);
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
    result: (row.result ?? '').trim() || null,
    status: 'draft' as const,
  };
}

export type DbRow = ReturnType<typeof toDbRow>;
export type StoredRow = Partial<Omit<DbRow, 'status'>> & { slug: string };

const norm = (r: Partial<DbRow>) => JSON.stringify([
  r.kind ?? null, r.title ?? null, r.body ?? null, r.tags ?? [], r.difficulty ?? null, r.tools ?? null,
  r.steps ?? null,
  Array.isArray(r.sources) ? r.sources.map((x) => [x.citation, x.url, x.accessed]) : null,
]);

export type ImportIo = {
  fetchExisting: (slugs: string[]) => Promise<StoredRow[]>;
  upsert: (dbRows: (DbRow & { reviewed_by: null })[]) => Promise<void>;
  /** Write only the result line; review status untouched. Needed when a result changes on its own. */
  updateResult?: (slug: string, result: string | null) => Promise<void>;
};
export type ImportResult = { inserted: number; updated: number; unchanged: number; resultOnly: number };

/**
 * Validates every row first; writes nothing if any row is bad. Unchanged rows are skipped so
 * reviewed rows stay reviewed. New and changed rows are written as draft with reviewed_by cleared.
 */
export async function importRows(rows: KbCsvRow[], io: ImportIo): Promise<ImportResult> {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) problems.push(`${r.id}: duplicate id in file`);
    seen.add(r.id);
    for (const e of validateRow(r)) problems.push(`${r.id || '(no id)'}: ${e}`);
  }
  if (problems.length) throw new Error(`KB import refused:\n${problems.join('\n')}`);

  const incoming = rows.map(toDbRow);
  const existing = new Map((await io.fetchExisting(incoming.map((r) => r.slug))).map((e) => [e.slug, e]));
  const toWrite: (DbRow & { reviewed_by: null })[] = [];
  const resultWrites: { slug: string; result: string | null }[] = [];
  let inserted = 0, updated = 0, unchanged = 0, resultOnly = 0;
  for (const r of incoming) {
    const old = existing.get(r.slug);
    if (!old) inserted++;
    else if (norm(old) === norm(r)) {
      // The result line is image-prompt guidance, not a reviewed claim: changing it alone keeps the review.
      if ((old.result ?? null) !== r.result) { resultOnly++; resultWrites.push({ slug: r.slug, result: r.result }); }
      else unchanged++;
      continue;
    }
    else updated++;
    toWrite.push({ ...r, reviewed_by: null });
  }
  if (resultWrites.length && !io.updateResult) throw new Error('KB import: updateResult is required to change result lines');
  if (toWrite.length) await io.upsert(toWrite);
  for (const w of resultWrites) await io.updateResult!(w.slug, w.result);
  return { inserted, updated, unchanged, resultOnly };
}

/** Why a row may not be marked reviewed, or null if it may. Re-checks the stored row. */
export function reviewBlocker(entry: { kind: string; tags?: string[] | null; sources: unknown } | null): string | null {
  if (!entry) return 'unknown slug';
  const problems = tagErrors(entry.kind, entry.tags ?? []);
  if (entry.kind === 'history' && (!Array.isArray(entry.sources) || entry.sources.length === 0)) {
    problems.push('history entry has no sources; add a verifiable source or drop the entry');
  } else if (entry.sources != null) {
    const e = sourcesShapeError(entry.sources);
    if (e) problems.push(e);
  }
  return problems.length ? problems.join('; ') : null;
}
