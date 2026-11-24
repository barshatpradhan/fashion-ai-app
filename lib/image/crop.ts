/**
 * Crop a garment picture to the garment: trim transparent margins (cut-outs) and plain white margins
 * (studio photos and concept images), so the piece fills its space on the rail like a flat cut-out.
 * contentBox is pure; the canvas helpers run in the browser and fall back to the input on any failure.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** A pixel counts as garment when it is clearly opaque and not near-white. */
const ALPHA_MIN = 24;
const WHITE_MIN = 244;

/**
 * The smallest box holding every garment pixel, grown by `pad` and kept inside the image.
 * Null when there is nothing to trim (empty image, or content already touching every edge).
 */
export function contentBox(data: Uint8ClampedArray, width: number, height: number, opts: { pad?: number } = {}): Box | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    let row = y * width * 4;
    for (let x = 0; x < width; x++, row += 4) {
      const a = data[row + 3];
      if (a < ALPHA_MIN) continue;
      if (data[row] >= WHITE_MIN && data[row + 1] >= WHITE_MIN && data[row + 2] >= WHITE_MIN) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const pad = opts.pad ?? 0;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const box = { x, y, width: Math.min(width, maxX + 1 + pad) - x, height: Math.min(height, maxY + 1 + pad) - y };
  if (box.width === width && box.height === height) return null;
  return box;
}

/** Work at most this many pixels on the long side when measuring (the crop itself uses full size). */
const MEASURE_EDGE = 256;

async function decode(src: Blob | string): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof src !== 'string') {
    const bmp = await createImageBitmap(src);
    return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  }
  const img = new Image();
  img.crossOrigin = 'anonymous'; // signed Storage URLs allow it; without it the canvas would be unreadable
  img.src = src;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => {} };
}

/** Measure on a small copy, then cut the full-size image. Returns a PNG (keeps transparency) or null. */
async function cropToPng(src: Blob | string): Promise<Blob | null> {
  const pic = await decode(src);
  try {
    const scale = Math.min(1, MEASURE_EDGE / Math.max(pic.width, pic.height));
    const mw = Math.max(1, Math.round(pic.width * scale));
    const mh = Math.max(1, Math.round(pic.height * scale));
    const m = document.createElement('canvas');
    m.width = mw;
    m.height = mh;
    const mctx = m.getContext('2d', { willReadFrequently: true });
    if (!mctx) return null;
    mctx.drawImage(pic.source, 0, 0, mw, mh);
    const small = contentBox(mctx.getImageData(0, 0, mw, mh).data, mw, mh, { pad: 2 });
    if (!small) return null;

    const box = {
      x: Math.floor(small.x / scale), y: Math.floor(small.y / scale),
      width: Math.min(pic.width, Math.ceil(small.width / scale)), height: Math.min(pic.height, Math.ceil(small.height / scale)),
    };
    const out = document.createElement('canvas');
    out.width = box.width;
    out.height = box.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(pic.source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    return await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  } finally {
    pic.done();
  }
}

/** A cut-out trimmed to the garment before upload; the original when there is nothing to trim or it fails. */
export async function cropToContent(blob: Blob): Promise<Blob> {
  try {
    return (await cropToPng(blob)) ?? blob;
  } catch {
    return blob;
  }
}

/** For display: an object URL of the trimmed picture, or null to keep showing `url` as it is. */
export async function croppedObjectUrl(url: string): Promise<string | null> {
  try {
    const png = await cropToPng(url);
    return png ? URL.createObjectURL(png) : null;
  } catch {
    return null;
  }
}
