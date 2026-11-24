import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  generate: vi.fn(),
  edit: vi.fn(),
  geminiGen: vi.fn(),
  env: { IMAGE_PROVIDER: 'openai' as 'openai' | 'gemini', OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' },
}));
vi.mock('openai', () => ({
  default: class { images = { generate: h.generate, edit: h.edit }; },
  toFile: async (data: Uint8Array, name: string, opts: { type: string }) => ({ name, type: opts.type, size: data.length }),
}));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: h.geminiGen }; } }));
vi.mock('@/lib/env', () => ({ getEnv: () => h.env, getEnvFor: () => h.env }));

import { generateConceptImage, OPENAI_IMAGE_MODEL } from '@/lib/ai/imageGen';
import { AiRateLimitError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

const printed = {
  is_garment: true, garment_type: 't-shirt', category: 'top', image_quality: 'clear',
  parts: { front: "graphic text print reading 'NYC'" }, pattern: 'graphic print',
  colors: [{ name: 'cream', hex: 'EFECE1' }], fabric_guess: { value: 'cotton', confidence: 0.9, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: ['t-shirt', 'graphic'], named_styles: [],
} as VisionResult;
const plain = { ...printed, parts: {}, pattern: 'solid', tags: ['sweater'] } as VisionResult;
const recipe: KbEntry = { id: 'r', kind: 'redesign', title: 'Tote', body: 'b', tags: [], status: 'reviewed', result: 'A flat bag with two handles.' };
const photo = new Uint8Array([9, 9, 9]);
const b64 = Buffer.from([1, 2, 3]).toString('base64');

beforeEach(() => {
  h.generate.mockReset(); h.edit.mockReset(); h.geminiGen.mockReset();
  h.env.IMAGE_PROVIDER = 'openai';
});

describe('generateConceptImage with the scan photo (OpenAI)', () => {
  it('edits the photo instead of drawing from text, in one call', async () => {
    h.edit.mockResolvedValue({ data: [{ b64_json: b64 }] });
    const out = await generateConceptImage(printed, recipe, photo);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(h.edit).toHaveBeenCalledTimes(1);
    expect(h.generate).not.toHaveBeenCalled();
    const params = h.edit.mock.calls[0][0];
    expect(params).toMatchObject({ model: OPENAI_IMAGE_MODEL, size: '1024x1024', quality: 'medium' });
    expect(params.image).toMatchObject({ name: 'garment.jpg', type: 'image/jpeg', size: 3 });
    expect(params.prompt).toMatch(/the garment in the photo/i);
    expect(params.prompt).toContain('A flat bag with two handles.');
  });

  it('pays for high input fidelity only when there is a print to keep', async () => {
    h.edit.mockResolvedValue({ data: [{ b64_json: b64 }] });
    await generateConceptImage(printed, recipe, photo);
    await generateConceptImage(plain, recipe, photo);
    expect(h.edit.mock.calls[0][0].input_fidelity).toBe('high');
    expect(h.edit.mock.calls[1][0].input_fidelity).toBe('low');
  });

  it('without a photo (deleted images), draws from the description', async () => {
    h.generate.mockResolvedValue({ data: [{ b64_json: b64 }] });
    await generateConceptImage(printed, recipe, null);
    expect(h.edit).not.toHaveBeenCalled();
    expect(h.generate.mock.calls[0][0].prompt).toMatch(/cotton t-shirt after this redesign/i);
  });

  it('an edit refused as invalid (400) falls back to one text-only call', async () => {
    h.edit.mockRejectedValue(Object.assign(new Error('Invalid image'), { status: 400 }));
    h.generate.mockResolvedValue({ data: [{ b64_json: b64 }] });
    expect(Array.from(await generateConceptImage(printed, recipe, photo))).toEqual([1, 2, 3]);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it('a busy provider is not retried as text (no double spending)', async () => {
    h.edit.mockRejectedValue(Object.assign(new Error('Rate limit'), { status: 429 }));
    await expect(generateConceptImage(printed, recipe, photo)).rejects.toBeInstanceOf(AiRateLimitError);
    expect(h.generate).not.toHaveBeenCalled();
  });
});

describe('generateConceptImage with the scan photo (Gemini)', () => {
  it('sends the photo inline with the brief', async () => {
    h.env.IMAGE_PROVIDER = 'gemini';
    h.geminiGen.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { data: b64 } }] } }] });
    await generateConceptImage(printed, recipe, photo);
    const parts = h.geminiGen.mock.calls[0][0].contents[0].parts;
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: Buffer.from(photo).toString('base64') } });
    expect(parts[1].text).toMatch(/the garment in the photo/i);
  });
});
