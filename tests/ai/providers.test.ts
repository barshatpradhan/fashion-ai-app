import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  geminiGen: vi.fn(),
  openaiGen: vi.fn(),
  env: {
    GEMINI_API_KEY: 'g',
    OPENAI_API_KEY: 'o',
    IMAGE_PROVIDER: 'gemini' as 'gemini' | 'openai',
    AI_TIMEOUT_MS: 20000,
  },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: h.geminiGen };
  },
}));
vi.mock('openai', () => ({
  default: class {
    images = { generate: h.openaiGen };
  },
}));
vi.mock('@/lib/env', () => ({ getEnv: () => h.env }));
vi.mock('@/lib/db/admin', () => ({ adminClient: vi.fn() }));

import { analyzeImage } from '@/lib/ai/vision';
import { writeGuide } from '@/lib/ai/writer';
import { generateConceptImage } from '@/lib/ai/imageGen';
import { withGuard, setDemoCacheStore, type DemoCacheStore } from '@/lib/ai/guard';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

const goodVision = {
  is_garment: true,
  garment_type: 'shirt',
  category: 'top',
  parts: { collar: 'point-collar' },
  pattern: 'stripes',
  colors: [{ name: 'navy', hex: '#001f3f' }],
  fabric_guess: { value: 'cotton', confidence: 0.8, alternatives: [] },
  condition_notes: '',
  visible_techniques: [],
  tags: ['shirt', 'cotton'],
  named_styles: [{ style: 'breton-stripe', confidence: 0.7 }],
};
const vision = goodVision as unknown as VisionResult;
const recipe: KbEntry = { id: 'r1', kind: 'redesign', title: 'Crop it', body: 'b', tags: [], status: 'reviewed' };
const hist: KbEntry = { id: 'h1', kind: 'history', title: 'Stripes', body: 'b', tags: [], status: 'reviewed' };
const bytes = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  h.geminiGen.mockReset();
  h.openaiGen.mockReset();
  h.env.IMAGE_PROVIDER = 'gemini';
});

describe('analyzeImage', () => {
  it('parses valid JSON', async () => {
    h.geminiGen.mockResolvedValue({ text: JSON.stringify(goodVision) });
    const r = await analyzeImage(bytes);
    expect(r.garment_type).toBe('shirt');
    expect(h.geminiGen.mock.calls[0][0].config.responseMimeType).toBe('application/json');
  });
  it('maps a 429 to AiRateLimitError', async () => {
    h.geminiGen.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    await expect(analyzeImage(bytes)).rejects.toBeInstanceOf(AiRateLimitError);
  });
  it('maps invalid JSON to AiBadOutputError', async () => {
    h.geminiGen.mockResolvedValue({ text: 'not json {' });
    await expect(analyzeImage(bytes)).rejects.toBeInstanceOf(AiBadOutputError);
  });
});

describe('writeGuide', () => {
  it('drops historyRefs ids that were not passed in', async () => {
    h.geminiGen.mockResolvedValue({
      text: JSON.stringify({ steps: ['a'], tools: ['t'], historyRefs: ['h1', 'made-up'] }),
    });
    const g = await writeGuide(vision, recipe, [hist]);
    expect(g.historyRefs).toEqual(['h1']);
  });
});

describe('generateConceptImage', () => {
  it('uses OpenAI and not Gemini when IMAGE_PROVIDER=openai', async () => {
    h.env.IMAGE_PROVIDER = 'openai';
    h.openaiGen.mockResolvedValue({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] });
    const out = await generateConceptImage(vision, recipe);
    expect(h.openaiGen).toHaveBeenCalledTimes(1);
    expect(h.geminiGen).not.toHaveBeenCalled();
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
  it('uses Gemini when IMAGE_PROVIDER=gemini', async () => {
    h.geminiGen.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from(bytes).toString('base64') } }] } }],
    });
    const out = await generateConceptImage(vision, recipe);
    expect(h.openaiGen).not.toHaveBeenCalled();
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});

describe('withGuard', () => {
  let store: DemoCacheStore;
  beforeEach(() => {
    vi.useFakeTimers();
    store = { get: vi.fn(async () => ({ cached: true })), set: vi.fn(async () => {}) };
    setDemoCacheStore(store);
  });
  afterEach(() => {
    vi.useRealTimers();
    setDemoCacheStore(null);
  });

  it('demo: returns cached value after timeoutMs when fn takes 25s', async () => {
    const slow = () => new Promise<unknown>((r) => setTimeout(() => r({ fresh: true }), 25000));
    const p = withGuard('k', slow, { timeoutMs: 20000, demo: true });
    await vi.advanceTimersByTimeAsync(20000);
    await expect(p).resolves.toEqual({ cached: true });
    expect(store.get).toHaveBeenCalledWith('k');
  });
  it('non-demo: rejects with AiTimeoutError', async () => {
    const slow = () => new Promise<unknown>((r) => setTimeout(() => r(1), 25000));
    const p = withGuard('k', slow, { timeoutMs: 20000, demo: false });
    const assertion = expect(p).rejects.toBeInstanceOf(AiTimeoutError);
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(store.get).not.toHaveBeenCalled();
  });
  it('demo: writes successful results to the cache and leaves no timers', async () => {
    await expect(withGuard('k', async () => ({ ok: 1 }), { timeoutMs: 1000, demo: true })).resolves.toEqual({ ok: 1 });
    expect(store.set).toHaveBeenCalledWith('k', { ok: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('demo: failure with no cache entry rethrows the original error', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      withGuard('k', async () => { throw new AiRateLimitError('x'); }, { timeoutMs: 1000, demo: true }),
    ).rejects.toBeInstanceOf(AiRateLimitError);
  });
});
