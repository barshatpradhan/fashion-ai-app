import 'server-only';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { adminClient } from '@/lib/db/admin';
import { contentTypeFor, pickPhotos } from '@/lib/demo/photos';

/** Image files in a folder, sorted, capped. Throws a readable error when there are none. */
export function photosIn(folder: string, max = Infinity): string[] {
  const names = pickPhotos(readdirSync(folder), max);
  if (!names.length) throw new Error(`no .jpg/.png/.webp photos found in ${folder}`);
  return names;
}

/**
 * Uploads an original under the user's folder. Background removal is browser-only, so the original
 * stands in as the cut-out (same fallback the app uses when removal fails).
 */
export async function uploadOriginal(userId: string, folder: string, name: string) {
  const bytes = readFileSync(join(folder, name));
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const imagePath = `${userId}/${randomUUID()}.${ext}`;
  const { error } = await adminClient().storage.from('garments')
    .upload(imagePath, bytes, { contentType: contentTypeFor(name), upsert: false });
  if (error) throw new Error(`upload of ${name} failed: ${error.message}`);
  return { imagePath, cutoutPath: imagePath };
}
