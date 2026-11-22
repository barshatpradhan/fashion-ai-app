import OpenAI from 'openai';
import { getEnvFor } from '@/lib/env';
import { geminiGenerate, GEMINI_IMAGE_MODEL } from '@/lib/ai/gemini';
import { AiBadOutputError, mapSdkError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

export const OPENAI_IMAGE_MODEL = 'gpt-image-1';

export function conceptPrompt(v: VisionResult, recipe: KbEntry): string {
  return `A ${v.fabric_guess.value} ${v.garment_type} redesigned as: ${recipe.title}. ${recipe.body}
Show only the redesigned garment as a clean product cut-out on a plain off-white background. No people, no mannequin, no text.`;
}

export async function generateConceptImage(v: VisionResult, recipe: KbEntry): Promise<Uint8Array> {
  const prompt = conceptPrompt(v, recipe);
  const e = getEnvFor(['IMAGE_PROVIDER', 'OPENAI_API_KEY']);
  if (e.IMAGE_PROVIDER === 'openai') {
    let b64: string | undefined;
    try {
      const res = await new OpenAI({ apiKey: e.OPENAI_API_KEY }).images.generate({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        size: '1024x1024',
      });
      b64 = res.data?.[0]?.b64_json;
    } catch (err) {
      throw mapSdkError(err);
    }
    if (!b64) throw new AiBadOutputError('OpenAI returned no image');
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const res = await geminiGenerate({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseModalities: ['IMAGE'] },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new AiBadOutputError('Gemini returned no image');
  return new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
}
