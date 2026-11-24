import { describe, it, expect } from 'vitest';
import { mapSdkError, AiRateLimitError } from '@/lib/ai/errors';

describe('mapSdkError', () => {
  it('maps 429 / RESOURCE_EXHAUSTED to a busy error', () => {
    expect(mapSdkError({ status: 429, message: 'quota' })).toBeInstanceOf(AiRateLimitError);
    expect(mapSdkError({ message: '{"status":"RESOURCE_EXHAUSTED"}' })).toBeInstanceOf(AiRateLimitError);
  });

  // Regression: Gemini answers "model is experiencing high demand" with 503 UNAVAILABLE. It reached
  // the user as a generic server error ("Something went wrong uploading") instead of "try again".
  it('maps 503 / UNAVAILABLE (provider overloaded) to a busy error', () => {
    expect(mapSdkError({ status: 503, message: 'high demand' })).toBeInstanceOf(AiRateLimitError);
    expect(mapSdkError({ message: '{"error":{"code":503,"status":"UNAVAILABLE"}}' })).toBeInstanceOf(AiRateLimitError);
  });

  it('passes other errors through unchanged', () => {
    const e = { status: 404, message: 'model not found' };
    expect(mapSdkError(e)).toBe(e);
  });
});
