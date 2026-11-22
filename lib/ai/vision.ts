import { geminiGenerate, jpegPart, GEMINI_VISION_MODEL } from '@/lib/ai/gemini';
import { AiBadOutputError } from '@/lib/ai/errors';
import { parseVision, VisionParseError, type VisionResult } from '@/lib/ai/visionSchema';
import { NAMED_STYLES, GENERIC_TAGS, FABRICS } from '@/lib/domain/vocabulary';

export const VISION_PROMPT = `You describe a single clothing item from a photo.
Rules:
- Describe observable features only: what you can literally see (shape, parts, colors, pattern, fabric appearance, visible construction).
- Do NOT make any claim about history, origin, culture, era, or brand. Do not mention stores or shopping.
- If no garment is visible, set "is_garment" to false.
- "tags": choose ONLY from this list, lowercase, written exactly as listed: ${[...NAMED_STYLES, ...GENERIC_TAGS].join(', ')}.
- "fabric_guess.value": choose ONLY from this list, lowercase, exactly as listed: ${FABRICS.join(', ')}.
- "named_styles": each "style" must be ONLY one of: ${NAMED_STYLES.join(', ')} (lowercase, exactly as listed), with a "confidence" from 0 to 1. Omit styles you do not see.
Return JSON with keys: is_garment (boolean), garment_type (string), category (top|bottom|dress|outerwear|accessory|other), parts (object of part name to short description), pattern (string), colors ([{name, hex}]), fabric_guess ({value, confidence 0-1, alternatives[]}), condition_notes (string), visible_techniques (string[]), tags (string[]), named_styles ([{style, confidence}]).`;

export async function analyzeImage(jpeg: Uint8Array): Promise<VisionResult> {
  const res = await geminiGenerate({
    model: GEMINI_VISION_MODEL,
    contents: [{ role: 'user', parts: [jpegPart(jpeg), { text: VISION_PROMPT }] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  try {
    return parseVision(res.text ?? '');
  } catch (err) {
    if (err instanceof VisionParseError) throw new AiBadOutputError(err.message, { cause: err });
    throw err;
  }
}

const CARE_PROMPT = `Read the care label in this photo. Return JSON {"fabric": string|null, "text": string}.
"text" is the label text exactly as printed. "fabric" is the main fabric, lowercase, chosen ONLY from: ${FABRICS.join(', ')}; use null if not stated or not in the list.`;

export async function readCareLabel(jpeg: Uint8Array): Promise<{ fabric: string | null; text: string }> {
  const res = await geminiGenerate({
    model: GEMINI_VISION_MODEL,
    contents: [{ role: 'user', parts: [jpegPart(jpeg), { text: CARE_PROMPT }] }],
    config: { responseMimeType: 'application/json', temperature: 0 },
  });
  try {
    const raw = JSON.parse(res.text ?? '') as { fabric?: unknown; text?: unknown };
    const fabric = typeof raw.fabric === 'string' && (FABRICS as readonly string[]).includes(raw.fabric) ? raw.fabric : null;
    return { fabric, text: typeof raw.text === 'string' ? raw.text : '' };
  } catch (cause) {
    throw new AiBadOutputError('Care label output is not valid JSON', { cause });
  }
}
