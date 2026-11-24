/**
 * Client-side photo preparation: HEIC -> JPEG conversion, downscale to MAX_EDGE on the long side,
 * JPEG re-encode and SHA-256 of the bytes that will be uploaded. Browser APIs (decoder, canvas,
 * heic2any, background removal) sit behind small injectable functions so tests can use fakes.
 */
import { MESSAGES } from '@/lib/ui/messages';

export const MAX_EDGE = 1024;
export const JPEG_QUALITY = 0.85;
/** Refuse before decoding: a huge file can stall or crash the tab. Phone photos are well under this. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class UnsupportedImageError extends Error {
  constructor(cause?: unknown) {
    super(MESSAGES.unsupportedFormat, { cause });
    this.name = 'UnsupportedImageError';
  }
}

export class TooLargeImageError extends Error {
  constructor() {
    super(MESSAGES.photoTooLarge);
    this.name = 'TooLargeImageError';
  }
}

export type Decoded = { source: CanvasImageSource; width: number; height: number; close?: () => void };

export type ImageIO = {
  decode(blob: Blob): Promise<Decoded>;
  encodeJpeg(image: Decoded, width: number, height: number, quality: number): Promise<Blob>;
  convertHeic(blob: Blob): Promise<Blob>;
  sha256Hex(bytes: ArrayBuffer): Promise<string>;
};

export type PreparedImage = { jpeg: Blob; width: number; height: number; hash: string };

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

export function isHeic(file: File): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

/** Fit inside MAX_EDGE on the long side; never upscale. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

async function browserDecode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function browserEncodeJpeg(image: Decoded, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  // JPEG has no alpha: flatten transparent PNGs onto white rather than black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', quality),
  );
}

async function heic2anyConvert(blob: Blob): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

async function subtleSha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const browserImageIO: ImageIO = {
  decode: browserDecode,
  encodeJpeg: browserEncodeJpeg,
  convertHeic: heic2anyConvert,
  sha256Hex: subtleSha256Hex,
};

export async function prepareImage(file: File, overrides: Partial<ImageIO> = {}): Promise<PreparedImage> {
  const io: ImageIO = { ...browserImageIO, ...overrides };
  if (file.size === 0) throw new UnsupportedImageError();
  if (file.size > MAX_INPUT_BYTES) throw new TooLargeImageError();

  let source: Blob = file;
  if (isHeic(file)) {
    try {
      source = await io.convertHeic(file);
    } catch (err) {
      throw new UnsupportedImageError(err);
    }
  }

  let decoded: Decoded;
  try {
    decoded = await io.decode(source);
  } catch (err) {
    throw new UnsupportedImageError(err);
  }
  if (!(decoded.width > 0 && decoded.height > 0)) {
    decoded.close?.();
    throw new UnsupportedImageError();
  }

  const { width, height } = fitWithin(decoded.width, decoded.height);
  let jpeg: Blob;
  try {
    jpeg = await io.encodeJpeg(decoded, width, height, JPEG_QUALITY);
  } finally {
    decoded.close?.();
  }
  const hash = await io.sha256Hex(await readBytes(jpeg));
  return { jpeg, width, height, hash };
}

type RemoveBg = (image: Blob, config?: { output?: { format?: 'image/png'; quality?: number } }) => Promise<Blob>;

/** Loaded on demand: the model and WASM runtime are large and only needed after a photo is picked. */
async function loadImgly(): Promise<RemoveBg> {
  const mod = await import('@imgly/background-removal');
  return mod.removeBackground as RemoveBg;
}

/** Model download + inference can hang on a slow stage network; past this the original photo is used. */
export const BG_REMOVAL_TIMEOUT_MS = 12_000;

/**
 * Cut-out PNG with transparent background, or null on any failure or after `timeoutMs` (loading the
 * model included); the caller then uses the original photo.
 */
export async function removeBackground(
  jpeg: Blob, load: () => Promise<RemoveBg> = loadImgly, timeoutMs: number = BG_REMOVAL_TIMEOUT_MS,
): Promise<Blob | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`background removal took over ${timeoutMs} ms; using the original photo`);
      resolve(null);
    }, timeoutMs);
  });
  const work = (async () => {
    const run = await load();
    const out = await run(jpeg, { output: { format: 'image/png' } });
    return out && out.size > 0 ? out : null;
  })();
  try {
    return await Promise.race([work, timeout]);
  } catch (err) {
    console.warn('background removal failed; using the original photo', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
