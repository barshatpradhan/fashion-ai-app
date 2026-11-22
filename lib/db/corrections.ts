import 'server-only';
import { adminClient } from '@/lib/db/admin';
import {
  SCAN_ERRORS, FABRIC_CONFIRM_THRESHOLD, toMatchRows, toKbEntry, listCorrectionRows, type MatchRow,
} from '@/lib/db/scans';
import { confirmedFromCorrections, hasFabricCorrection, type CorrectionRow } from '@/lib/domain/corrections';
import { matchEntries } from '@/lib/domain/matching';
import { FABRICS } from '@/lib/domain/vocabulary';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry, Confirmed, MatchResult } from '@/lib/domain/types';

export const CORRECT_ERRORS = { notFound: 'not_found', invalidStyle: 'invalid_style' } as const;

export { confirmedFromCorrections, type CorrectionRow };

export type StoredScan = { id: string; userId: string; vision: VisionResult; fabricFinal: string | null };

export interface CorrectionRepo {
  loadScan(scanId: string): Promise<StoredScan | null>;
  /** Oldest first, so later rows win. */
  listCorrections(scanId: string): Promise<CorrectionRow[]>;
  insertCorrection(scanId: string, row: CorrectionRow): Promise<void>;
  setFabricFinal(scanId: string, fabric: string): Promise<void>;
  replaceMatches(scanId: string, rows: MatchRow[]): Promise<void>;
  outdateGuides(scanId: string): Promise<void>;
  loadReviewedEntries(): Promise<KbEntry[]>;
}

const lc = (s: string) => s.trim().toLowerCase();

export type ScanState = {
  scan: StoredScan;
  confirmed: Confirmed;
  hasFabricCorrection: boolean;
  corrections: CorrectionRow[];
};

/** Scan + effective confirmed state from all stored corrections. Null when the scan does not exist. */
export async function loadScanState(repo: CorrectionRepo, scanId: string): Promise<ScanState | null> {
  const scan = await repo.loadScan(scanId);
  if (!scan) return null;
  const corrections = await repo.listCorrections(scanId);
  return {
    scan, corrections,
    confirmed: confirmedFromCorrections(corrections),
    hasFabricCorrection: hasFabricCorrection(corrections),
  };
}

export type CorrectResult =
  | { status: 200; body: { match: MatchResult; needsFabricConfirm: boolean } }
  | { status: 400 | 404; body: { error: string } };

const fail = (status: 400 | 404, error: string): CorrectResult => ({ status, body: { error } });
const bad = () => fail(400, SCAN_ERRORS.badRequest);

export async function runCorrect(userId: string, input: unknown, repo: CorrectionRepo): Promise<CorrectResult> {
  const b = input as { scanId?: unknown; field?: unknown; value?: unknown; accept?: unknown } | null;
  if (!b || typeof b !== 'object' || typeof b.scanId !== 'string' || !b.scanId || typeof b.value !== 'string') return bad();
  if (b.field !== 'fabric' && b.field !== 'garment_type' && b.field !== 'named_style') return bad();
  const field = b.field;
  const value = lc(b.value);
  if (!value) return bad();
  if (field === 'fabric' && !(FABRICS as readonly string[]).includes(value)) return bad();
  if (field === 'named_style' && typeof b.accept !== 'boolean') return bad();

  const state = await loadScanState(repo, b.scanId);
  if (!state || state.scan.userId !== userId) return fail(404, CORRECT_ERRORS.notFound);
  const { scan, confirmed } = state;
  if (!scan.vision.is_garment) return bad();

  const entries = await repo.loadReviewedEntries();
  let row: CorrectionRow;
  if (field === 'named_style') {
    // Only a style the user is currently being asked about may be answered.
    const open = matchEntries(scan.vision, confirmed, entries).styleQuestions;
    if (!open.some((q) => lc(q.style) === value)) return fail(400, CORRECT_ERRORS.invalidStyle);
    row = { field, aiValue: value, userValue: b.accept === true ? 'yes' : 'no' };
  } else if (field === 'fabric') {
    row = { field, aiValue: confirmed.fabric ?? scan.fabricFinal ?? scan.vision.fabric_guess.value, userValue: value };
  } else {
    row = { field, aiValue: confirmed.garmentType ?? scan.vision.garment_type, userValue: value };
  }

  await repo.insertCorrection(scan.id, row);
  if (field === 'fabric') await repo.setFabricFinal(scan.id, value);

  const after = confirmedFromCorrections([...state.corrections, row]);
  const match = matchEntries(scan.vision, after, entries);
  await repo.replaceMatches(scan.id, toMatchRows(match));
  await repo.outdateGuides(scan.id);

  const needsFabricConfirm = state.hasFabricCorrection || field === 'fabric'
    ? false
    : scan.vision.fabric_guess.confidence < FABRIC_CONFIRM_THRESHOLD;
  return { status: 200, body: { match, needsFabricConfirm } };
}

export function supabaseCorrectionRepo(): CorrectionRepo {
  const db = adminClient();
  return {
    async loadScan(scanId) {
      const { data, error } = await db.from('scans').select('id, user_id, vision_json, fabric_final')
        .eq('id', scanId).maybeSingle();
      if (error) {
        if (error.code === '22P02') return null; // malformed uuid
        throw error;
      }
      if (!data || !data.vision_json) return null;
      return {
        id: data.id as string, userId: data.user_id as string,
        vision: data.vision_json as VisionResult, fabricFinal: (data.fabric_final as string | null) ?? null,
      };
    },
    listCorrections: (scanId) => listCorrectionRows(db, scanId),
    async insertCorrection(scanId, row) {
      const { error } = await db.from('corrections').insert({
        scan_id: scanId, field: row.field, ai_value: row.aiValue, user_value: row.userValue,
      });
      if (error) throw error;
    },
    async setFabricFinal(scanId, fabric) {
      const { error } = await db.from('scans').update({ fabric_final: fabric, fabric_source: 'user' }).eq('id', scanId);
      if (error) throw error;
    },
    async replaceMatches(scanId, rows) {
      const del = await db.from('scan_matches').delete().eq('scan_id', scanId);
      if (del.error) throw del.error;
      if (!rows.length) return;
      const { error } = await db.from('scan_matches').insert(
        rows.map((r) => ({ scan_id: scanId, kb_entry_id: r.kbEntryId, score: r.score, method: 'tag' })),
      );
      if (error) throw error;
    },
    async outdateGuides(scanId) {
      const { error } = await db.from('guides').update({ outdated: true }).eq('scan_id', scanId);
      if (error) throw error;
    },
    async loadReviewedEntries() {
      const { data, error } = await db.from('kb_entries').select('*').eq('status', 'reviewed');
      if (error) throw error;
      return (data ?? []).map(toKbEntry);
    },
  };
}
