import OpenAI, { toFile } from 'openai';
import { getEnvFor } from '@/lib/env';
import { geminiGenerate, GEMINI_IMAGE_MODEL } from '@/lib/ai/gemini';
import { AiBadOutputError, mapSdkError } from '@/lib/ai/errors';
import { conceptPrompt, needsHighFidelity } from '@/lib/ai/conceptPrompt';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

// gpt-image-1 now returns 400 "does not exist". gpt-image-2 verified live 2026-11-24 (8.7 s at low quality).
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
/**
 * Editing the user's photo. Measured 2026-11-24 on a printed tee: gpt-image-2 kept the print but took 91 s
 * (over the 50 s render limit) and rejects input_fidelity; gpt-image-1.5 at high fidelity kept it in 10 s.
 */
export const OPENAI_EDIT_MODEL = 'gpt-image-1.5';

const SIZE = '1024x1024';
// Pinned: "auto" may choose high quality, which is slower and can approach the render timeout.
const QUALITY = 'medium';

const b64Bytes = (b64: string | undefined, who: string) => {
  if (!b64) throw new AiBadOutputError(`${who} returned no image`);
  return new Uint8Array(Buffer.from(b64, 'base64'));
};

/** A request the provider refused as invalid (bad input), as opposed to busy, rate-limited or timed out. */
const isInvalidRequest = (err: unknown) => (err as { status?: unknown } | null)?.status === 400;

async function openaiConcept(v: VisionResult, recipe: KbEntry, photo: Uint8Array | null, apiKey: string): Promise<Uint8Array> {
  const client = new OpenAI({ apiKey });
  const fromText = async () => {
    try {
      const res = await client.images.generate({ model: OPENAI_IMAGE_MODEL, prompt: conceptPrompt(v, recipe, { withPhoto: false }), size: SIZE, quality: QUALITY });
      return b64Bytes(res.data?.[0]?.b64_json, 'OpenAI');
    } catch (err) {
      throw mapSdkError(err);
    }
  };
  if (!photo) return fromText();
  try {
    const res = await client.images.edit({
      model: OPENAI_EDIT_MODEL,
      image: await toFile(photo, 'garment.jpg', { type: 'image/jpeg' }),
      prompt: conceptPrompt(v, recipe, { withPhoto: true }),
      size: SIZE,
      quality: QUALITY,
      // Keeps the garment's own lettering, logos and pattern; costs more, so only when there is some.
      input_fidelity: needsHighFidelity(v) ? 'high' : 'low',
    });
    return b64Bytes(res.data?.[0]?.b64_json, 'OpenAI');
  } catch (err) {
    // A photo the edit endpoint rejects still gets a Concept, drawn from the same description (one extra
    // call, only on that failure). Busy, rate-limited or timed-out providers are not retried here.
    if (isInvalidRequest(err)) {
      console.warn('concept edit refused the photo; drawing from the description instead');
      return fromText();
    }
    throw mapSdkError(err);
  }
}

/**
 * The Concept image: this garment after the recipe. With the scan photo the provider edits the real
 * garment (one call); without it (images deleted) it draws from the scan's description.
 */
export async function generateConceptImage(v: VisionResult, recipe: KbEntry, photo: Uint8Array | null = null): Promise<Uint8Array> {
  const e = getEnvFor(['IMAGE_PROVIDER', 'OPENAI_API_KEY']);
  if (e.IMAGE_PROVIDER === 'openai') return openaiConcept(v, recipe, photo, e.OPENAI_API_KEY!);

  const text = { text: conceptPrompt(v, recipe, { withPhoto: Boolean(photo) }) };
  const parts = photo ? [{ inlineData: { mimeType: 'image/jpeg', data: Buffer.from(photo).toString('base64') } }, text] : [text];
  const res = await geminiGenerate({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['IMAGE'] },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  return b64Bytes(part?.inlineData?.data ?? undefined, 'Gemini');
}
