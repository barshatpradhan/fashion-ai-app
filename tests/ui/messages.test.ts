import { describe, it, expect } from 'vitest';
import { MESSAGES, messageForError } from '@/lib/ui/messages';

describe('scan error messages', () => {
  it('photo_unclear asks for a sharper, brighter photo', () => {
    expect(messageForError('photo_unclear')).toBe(MESSAGES.photoUnclear);
    expect(MESSAGES.photoUnclear).toMatch(/blurry|dark/i);
  });
  it('an oversized photo has its own message', () => {
    expect(MESSAGES.photoTooLarge).toMatch(/too large/i);
  });
});
