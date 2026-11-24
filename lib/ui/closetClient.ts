'use client';
import { browserClient, ensureSession } from '@/lib/db/browser';
import { prepareImage, removeBackground } from '@/lib/image/prepare';
import { cropToContent } from '@/lib/image/crop';

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
  const raw = await removeBackground(prepared.jpeg);
  const cutout = raw ? await cropToContent(raw) : null; // trimmed to the garment
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

/**
 * A piece saved as its plain photo (background removal failed at the time): cut it out now in the browser,
 * trim it to the garment, upload it and point the garment at it. Returns an object URL of the new cut-out,
 * or null when it could not be cut out (the photo stays as it is).
 */
export async function cutOutSavedPhoto(garmentId: string, photoUrl: string): Promise<string | null> {
  try {
    const userId = await ensureSession();
    const res = await fetch(photoUrl);
    if (!res.ok) return null;
    const raw = await removeBackground(await res.blob());
    if (!raw) return null;
    const cutout = await cropToContent(raw);
    const path = `${userId}/${crypto.randomUUID()}-cutout.png`;
    const storage = browserClient().storage.from(BUCKET);
    const up = await storage.upload(path, cutout, { contentType: 'image/png', upsert: false });
    if (up.error) return null;
    const r = await postCloset({ action: 'set_cutout', garmentId, cutoutPath: path });
    if (r.status !== 200) {
      await removeUploaded([path]);
      return null;
    }
    return URL.createObjectURL(cutout);
  } catch (err) {
    console.warn('could not cut out a saved photo', err);
    return null;
  }
}
