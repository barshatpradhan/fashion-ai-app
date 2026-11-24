import { describe, it, expect } from 'vitest';
import { allowanceLabel, hoursUntil, noUploadsMessage, looksMessage } from '@/lib/ui/closet';

const NOW = new Date('2026-11-22T12:00:00Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('allowanceLabel', () => {
  it('shows "{n} uploads left · next in {h}h"', () => {
    expect(allowanceLabel({ remaining: 3, nextCreditAt: inHours(4.2) }, NOW)).toBe('3 uploads left · next in 5h');
    expect(allowanceLabel({ remaining: 0, nextCreditAt: inHours(33.6) }, NOW)).toBe('0 uploads left · next in 34h');
  });
  it('drops the "next in" part when no credit is pending', () => {
    expect(allowanceLabel({ remaining: 7, nextCreditAt: null }, NOW)).toBe('7 uploads left');
  });
  it('uses the singular for one', () => {
    expect(allowanceLabel({ remaining: 1, nextCreditAt: null }, NOW)).toBe('1 upload left');
  });
  it('shows "Unlimited"', () => {
    expect(allowanceLabel({ remaining: 'unlimited', nextCreditAt: null }, NOW)).toBe('Unlimited');
  });
});

describe('hoursUntil / noUploadsMessage', () => {
  it('rounds up and never goes below 1', () => {
    expect(hoursUntil(inHours(0.1), NOW)).toBe(1);
    expect(hoursUntil(inHours(-2), NOW)).toBe(1);
    expect(hoursUntil('garbage', NOW)).toBeNull();
  });
  it('explains when the next upload arrives', () => {
    expect(noUploadsMessage(inHours(10), NOW)).toBe("You're out of uploads for now. Your next one arrives in 10h.");
    expect(noUploadsMessage(null, NOW)).toBe("You're out of uploads for now.");
  });
});

describe('allowanceLabel for looks / looks messages', () => {
  it('shows "{n} looks left · next in {h}h"', () => {
    expect(allowanceLabel({ remaining: 2, nextCreditAt: inHours(4.2) }, NOW, 'look')).toBe('2 looks left · next in 5h');
    expect(allowanceLabel({ remaining: 1, nextCreditAt: null }, NOW, 'look')).toBe('1 look left');
    expect(allowanceLabel({ remaining: 'unlimited', nextCreditAt: null }, NOW, 'look')).toBe('Unlimited');
  });
  it('maps looks errors to friendly copy', () => {
    expect(looksMessage('closet_too_small')).toBe('Add at least 2 pieces you own to get looks.');
    expect(looksMessage('no_looks', inHours(10), NOW)).toBe("You're out of looks for now. Your next one arrives in 10h.");
    expect(looksMessage('ai_busy')).toMatch(/busy/);
  });
});
