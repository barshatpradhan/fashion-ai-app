/** Profile page copy helpers (client-safe). */

export type ActivityKind = 'upload' | 'reconstruct' | 'style';
export type ActivityView = {
  id: string; kind: ActivityKind; garmentName: string | null; createdAt: string;
};

export function activityLabel(a: { kind: ActivityKind; garmentName: string | null }): string {
  const name = a.garmentName?.trim();
  switch (a.kind) {
    case 'upload': return name ? `Uploaded ${name}` : 'Uploaded a piece';
    case 'reconstruct': return name ? `Reconstructed ${name}` : 'Reconstructed a piece';
    case 'style': return 'Styled a look';
  }
}

export function activityDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function sortActivity<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
