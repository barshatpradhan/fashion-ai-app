import type { Confirmed } from '@/lib/domain/types';

/**
 * Storage encoding (corrections table):
 * - fabric / garment_type: ai_value = value before the correction, user_value = the new value.
 * - named_style: ai_value = the lowercased style name, user_value = 'yes' | 'no'.
 */
export type CorrectionRow = {
  field: 'fabric' | 'garment_type' | 'named_style';
  aiValue: string | null;
  userValue: string | null;
};

const lc = (s: string) => s.trim().toLowerCase();

/** Effective Confirmed state: the latest correction per field / style wins. */
export function confirmedFromCorrections(rows: CorrectionRow[]): Confirmed {
  let fabric: string | undefined;
  let garmentType: string | undefined;
  const styles = new Map<string, boolean>();
  for (const r of rows) {
    if (r.field === 'fabric' && r.userValue) fabric = r.userValue;
    else if (r.field === 'garment_type' && r.userValue) garmentType = r.userValue;
    else if (r.field === 'named_style' && r.aiValue) styles.set(lc(r.aiValue), r.userValue === 'yes');
  }
  const namedStyles: string[] = [];
  const rejectedStyles: string[] = [];
  for (const [style, accepted] of styles) (accepted ? namedStyles : rejectedStyles).push(style);
  return { ...(fabric ? { fabric } : {}), ...(garmentType ? { garmentType } : {}), namedStyles, rejectedStyles };
}

export const hasFabricCorrection = (rows: CorrectionRow[]) => rows.some((c) => c.field === 'fabric');
