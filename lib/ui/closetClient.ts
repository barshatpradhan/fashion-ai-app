'use client';
import { browserClient, ensureSession } from '@/lib/db/browser';
import { prepareImage, removeBackground } from '@/lib/image/prepare';

const BUCKET = 'garments';

export type ClosetResponse<T = Record<string, unknown>> = {
  status: number;
  json: T & { error?: string; nextCreditAt?: string };
};

export async function postCloset<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<ClosetResponse<T>> {
  const res = await fetch('/api/closet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as ClosetResponse<T>['json'] };
}

export type UploadedPhoto = { imagePath: string; cutoutPath: string; paths: string[] };

/**
 * Prepares a photo (HEIC, resize, JPEG), lifts it from its background and uploads both to the user's own
 * folder. Without a cut-out the original stands in. `paths` lists every object written (for cleanup).
 */
export async function uploadPhoto(file: File, onStep?: (step: string) => void): Promise<UploadedPhoto> {
  onStep?.('Preparing your photo');
  const userId = await ensureSession();
  const prepared = await prepareImage(file);
  onStep?.('Lifting it from the background');
  const cutout = await removeBackground(prepared.jpeg);
  onStep?.('Uploading');
  const storage = browserClient().storage.from(BUCKET);
  const id = crypto.randomUUID();
  const imagePath = `${userId}/${id}.jpg`;
  const up = await storage.upload(imagePath, prepared.jpeg, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new Error('image_not_found');
  const paths = [imagePath];
  let cutoutPath = imagePath;
  if (cutout) {
    const p = `${userId}/${id}-cutout.png`;
    const upCut = await storage.upload(p, cutout, { contentType: 'image/png', upsert: false });
    if (!upCut.error) {
      cutoutPath = p;
      paths.push(p);
    }
  }
  return { imagePath, cutoutPath, paths };
}

/** Best-effort cleanup of objects uploaded for a request the server refused (RLS: own folder only). */
export async function removeUploaded(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await browserClient().storage.from(BUCKET).remove(paths);
  } catch (err) {
    console.warn('could not remove uploaded photo', err);
  }
}
