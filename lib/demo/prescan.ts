/** Pure helpers for scripts/prescan.ts. */
export type ScanRow = { id: string; vision_json: { is_garment?: boolean } | null };

export function pickGarmentScans<T extends ScanRow>(rows: T[], only?: string): T[] {
  return rows.filter((r) => r.vision_json?.is_garment === true && (!only || r.id === only));
}

export function scanArg(argv: string[]): string | undefined {
  const i = argv.indexOf('--scan');
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v) throw new Error('--scan needs a scan id');
  return v;
}

export function summaryLine(s: { found: number; guides: number; images: number; failures: number }): string {
  return `Scans found: ${s.found}, guides warmed: ${s.guides}, images warmed: ${s.images}, failures: ${s.failures}`;
}
