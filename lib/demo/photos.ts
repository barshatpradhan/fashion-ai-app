/** Pure helpers shared by scripts/seed-demo.ts and scripts/prescan.ts. */
export const MAX_DEMO_PHOTOS = 12;

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
const ext = (n: string) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();

export function isImageFile(name: string): boolean {
  return !name.startsWith('.') && name.includes('.') && ext(name) in TYPES;
}
export function contentTypeFor(name: string): string {
  return TYPES[ext(name)] ?? 'application/octet-stream';
}
/** Image file names, sorted, optionally capped. */
export function pickPhotos(names: string[], max = Infinity): string[] {
  return names.filter(isImageFile).sort((a, b) => a.localeCompare(b)).slice(0, max);
}
