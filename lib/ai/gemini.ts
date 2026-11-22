import { GoogleGenAI } from '@google/genai';
import { getEnvFor } from '@/lib/env';
import { mapSdkError } from '@/lib/ai/errors';

export const GEMINI_VISION_MODEL = 'gemini-2.5-flash';
export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
export const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

export function geminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getEnvFor(['GEMINI_API_KEY']).GEMINI_API_KEY });
}

type GenerateParams = Parameters<GoogleGenAI['models']['generateContent']>[0];

/** generateContent with SDK failures mapped to typed errors. */
export async function geminiGenerate(params: GenerateParams) {
  try {
    return await geminiClient().models.generateContent(params);
  } catch (err) {
    throw mapSdkError(err);
  }
}

export const jpegPart = (jpeg: Uint8Array) => ({
  inlineData: { mimeType: 'image/jpeg', data: Buffer.from(jpeg).toString('base64') },
});
