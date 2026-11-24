// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prepareImage, removeBackground, BG_REMOVAL_TIMEOUT_MS, UnsupportedImageError, TooLargeImageError, MAX_INPUT_BYTES, JPEG_QUALITY, MAX_EDGE,
  type ImageIO, type Decoded,
} from '@/lib/image/prepare';

const heic = vi.hoisted(() => ({ convert: vi.fn() }));
vi.mock('heic2any', () => ({ default: heic.convert }));

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG signature + IHDR header carrying the given dimensions (enough for the fake decoder). */
function pngBytes(width: number, height: number, seed = 0): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set(PNG_SIG, 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  b[24] = 8; b[25] = 6; b[32] = seed;
  return b;
}
const pngFile = (w: number, h: number, name = 'shirt.png', type = 'image/png') =>
  new File([pngBytes(w, h)], name, { type });

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(blob);
  }));
}

/** Fake decoder: reads PNG IHDR dimensions; anything else is "undecodable", like a browser decoder. */
const fakeDecode = vi.fn(async (blob: Blob): Promise<Decoded> => {
  const b = await bytesOf(blob);
  if (b.length < 24 || !PNG_SIG.every((v, i) => b[i] === v)) throw new Error('decode failed');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { source: { bytes: b } as unknown as CanvasImageSource, width: dv.getUint32(16), height: dv.getUint32(20) };
});
/** Fake encoder: deterministic bytes derived from the target size and the source bytes. */
const fakeEncode = vi.fn(async (src: Decoded, width: number, height: number, quality: number): Promise<Blob> => {
  const srcBytes = (src.source as unknown as { bytes: Uint8Array }).bytes;
  return new Blob([`JPEG ${width}x${height} q${quality} `, srcBytes as BlobPart], { type: 'image/jpeg' });
});
const io: Partial<ImageIO> = { decode: fakeDecode, encodeJpeg: fakeEncode };

beforeEach(() => vi.clearAllMocks());

describe('prepareImage', () => {
  it('scales a 4000x3000 PNG to 1024x768 JPEG at quality 0.85', async () => {
    const out = await prepareImage(pngFile(4000, 3000), io);
    expect(out.width).toBe(1024);
    expect(out.height).toBe(768);
    expect(out.jpeg.type).toBe('image/jpeg');
    expect(fakeEncode).toHaveBeenCalledWith(expect.anything(), 1024, 768, 0.85);
    expect(JPEG_QUALITY).toBe(0.85);
    expect(MAX_EDGE).toBe(1024);
  });

  it('scales portrait images by the long side and never upscales', async () => {
    const tall = await prepareImage(pngFile(1500, 3000), io);
    expect([tall.width, tall.height]).toEqual([512, 1024]);
    const small = await prepareImage(pngFile(640, 480), io);
    expect([small.width, small.height]).toEqual([640, 480]);
  });

  it('the same input twice gives the same hash (SHA-256 hex of the JPEG bytes)', async () => {
    const a = await prepareImage(pngFile(4000, 3000), io);
    const b = await prepareImage(pngFile(4000, 3000), io);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(b.hash);
    const digest = await crypto.subtle.digest('SHA-256', await bytesOf(a.jpeg) as BufferSource);
    const hex = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(a.hash).toBe(hex);
    const c = await prepareImage(pngFile(3000, 4000), io);
    expect(c.hash).not.toBe(a.hash);
  });

  it('a corrupt file rejects with UnsupportedImageError and the user-facing message', async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4, 5])], 'broken.jpg', { type: 'image/jpeg' });
    const err = await prepareImage(bad, io).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnsupportedImageError);
    expect((err as Error).message).toBe("This photo format isn't supported. Try a JPG or PNG.");
  });

  it('a file over 25 MB rejects with TooLargeImageError before decoding', async () => {
    expect(MAX_INPUT_BYTES).toBe(25 * 1024 * 1024);
    const big = pngFile(4000, 3000);
    Object.defineProperty(big, 'size', { value: MAX_INPUT_BYTES + 1 });
    const decode = vi.fn();
    const err = await prepareImage(big, { decode }).catch((e) => e);
    expect(err).toBeInstanceOf(TooLargeImageError);
    expect(err.message).toMatch(/too large/i);
    expect(decode).not.toHaveBeenCalled();
  });

  it('an empty file rejects with UnsupportedImageError', async () => {
    const empty = new File([], 'empty.png', { type: 'image/png' });
    await expect(prepareImage(empty, io)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('HEIC input is converted through heic2any before resizing', async () => {
    heic.convert.mockResolvedValue(new Blob([pngBytes(4032, 3024)], { type: 'image/png' }));
    const file = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])], 'IMG_0001.HEIC', { type: 'image/heic' });
    const out = await prepareImage(file, io);
    expect(heic.convert).toHaveBeenCalledTimes(1);
    expect(heic.convert).toHaveBeenCalledWith(expect.objectContaining({ blob: file, toType: 'image/jpeg' }));
    // The decoder saw the converted image, not the raw HEIC.
    expect(fakeDecode.mock.calls[0][0]).not.toBe(file);
    expect([out.width, out.height]).toEqual([1024, 768]);
  });

  it('detects HEIF by extension when the browser gives no MIME type', async () => {
    heic.convert.mockResolvedValue([new Blob([pngBytes(800, 600)], { type: 'image/png' })]);
    const file = new File([new Uint8Array([9, 9, 9])], 'photo.heif', { type: '' });
    const out = await prepareImage(file, io);
    expect(heic.convert).toHaveBeenCalledTimes(1);
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it('does not call heic2any for JPG/PNG', async () => {
    await prepareImage(pngFile(100, 100), io);
    expect(heic.convert).not.toHaveBeenCalled();
  });

  it('a HEIC that heic2any cannot convert rejects with UnsupportedImageError', async () => {
    heic.convert.mockRejectedValue(new Error('ERR_LIBHEIF'));
    const file = new File([new Uint8Array([1])], 'x.heic', { type: 'image/heic' });
    await expect(prepareImage(file, io)).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe('removeBackground', () => {
  const jpeg = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

  it('returns the cut-out PNG from the library', async () => {
    const cut = new Blob([new Uint8Array([7])], { type: 'image/png' });
    const lib = vi.fn(async () => cut);
    const out = await removeBackground(jpeg, async () => lib);
    expect(out).toBe(cut);
    expect(lib).toHaveBeenCalledWith(jpeg, expect.objectContaining({ output: expect.objectContaining({ format: 'image/png' }) }));
  });

  it('returns null when the library fails', async () => {
    const out = await removeBackground(jpeg, async () => async () => { throw new Error('wasm failed'); });
    expect(out).toBeNull();
  });

  it('returns null when removal hangs past the timeout (12 s by default)', async () => {
    expect(BG_REMOVAL_TIMEOUT_MS).toBe(12_000);
    const never = () => new Promise<Blob>(() => {});
    const out = await removeBackground(jpeg, async () => never, 20);
    expect(out).toBeNull();
  });

  it('times out a hanging model load too', async () => {
    const out = await removeBackground(jpeg, () => new Promise(() => {}), 20);
    expect(out).toBeNull();
  });

  it('returns null when the library cannot be loaded', async () => {
    const out = await removeBackground(jpeg, async () => { throw new Error('chunk load failed'); });
    expect(out).toBeNull();
  });
});
