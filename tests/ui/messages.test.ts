import { describe, it, expect } from 'vitest';
import { MESSAGES, messageForError, isExpectedOutcome } from '@/lib/ui/messages';

describe('scan error messages', () => {
  it('photo_unclear asks for a sharper, brighter photo', () => {
    expect(messageForError('photo_unclear')).toBe(MESSAGES.photoUnclear);
    expect(MESSAGES.photoUnclear).toMatch(/blurry|dark/i);
  });
  it('an oversized photo has its own message', () => {
    expect(MESSAGES.photoTooLarge).toMatch(/too large/i);
  });
});

// Regression: the scan page logged "not a garment" and "too blurry" with console.error, so a correctly
// handled photo showed up as an error (the dev overlay counted them as Issues).
describe('isExpectedOutcome', () => {
  it.each(['not_a_garment', 'photo_unclear', 'daily_cap', 'ai_busy', 'unsupported_format'])('%s is an expected outcome', (code) => {
    expect(isExpectedOutcome(code)).toBe(true);
  });
  it.each(['server_error', 'image_not_found', 'bad_request', null, undefined])('%s is a real failure', (code) => {
    expect(isExpectedOutcome(code)).toBe(false);
  });
});
