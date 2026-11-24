// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { ClosetRail } from '@/components/ClosetRail';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import type { ClosetGarment } from '@/lib/db/closet';

const g = (id: string, over: Partial<ClosetGarment> = {}): ClosetGarment => ({
  id, category: 'clothing', name: `Piece ${id}`, imageKind: 'photo', tags: ['denim'], status: 'active',
  isUpcycled: false, scanId: null, recipeId: null, createdAt: '2026-11-22T00:00:00Z', imageUrl: null, ...over,
});

afterEach(cleanup);

describe('ClosetRail', () => {
  it('names the piece under the pointer in one caption below the rail', () => {
    render(<ClosetRail garments={[g('a'), g('b')]} label="Your pieces" />);
    const caption = screen.getByTestId('rail-caption');
    expect(caption.textContent).toBe('2 pieces on the rail');
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Piece b' }));
    expect(caption.textContent).toBe('Piece b');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Piece b' }));
    expect(caption.textContent).toBe('2 pieces on the rail');
  });

  it('the chosen piece opens large with its place on the rail, and Close lets go', () => {
    render(<ClosetRail garments={[g('a'), g('b'), g('c')]} label="Your pieces" />);
    fireEvent.click(screen.getByRole('button', { name: 'Piece b' }));
    const detail = screen.getByRole('region', { name: 'Piece b details' });
    expect(within(detail).getByText('02 / 03')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Piece b details' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Your pieces' }).getAttribute('data-focused')).toBe('false');
  });

  it('choosing a piece brings it forward (aria-pressed, rail focused) and Escape lets go', () => {
    render(<ClosetRail garments={[g('a'), g('b')]} label="Your pieces" />);
    const rail = screen.getByRole('list', { name: 'Your pieces' });
    const a = screen.getByRole('button', { name: 'Piece a' });
    expect(rail.getAttribute('data-focused')).toBe('false');
    fireEvent.click(a);
    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(rail.getAttribute('data-focused')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Piece a' })).toBeTruthy();
    fireEvent.keyDown(a, { key: 'Escape' });
    expect(rail.getAttribute('data-focused')).toBe('false');
  });

  it('arrow keys move focus along the rail', () => {
    render(<ClosetRail garments={[g('a'), g('b')]} label="Rail" />);
    const a = screen.getByRole('button', { name: 'Piece a' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Piece b' }));
  });

  it('delete asks in-page before calling onDelete', async () => {
    const onDelete = vi.fn(async () => {});
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<ClosetRail garments={[g('a')]} label="Rail" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Piece a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete piece' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('a'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('Concept label', () => {
  it('a concept-image garment shows a visible "Concept" flag on its tile and in the selected view', () => {
    render(<ClosetRail garments={[g('c', { imageKind: 'concept', isUpcycled: true }), g('p')]} label="Rail" />);
    const tile = screen.getByRole('button', { name: 'Piece c, reworked, concept image' });
    expect(within(tile).getByText('Concept')).toBeTruthy();
    expect(screen.getAllByText('Concept')).toHaveLength(1); // the photo piece has none
    fireEvent.click(tile);
    const detail = screen.getByRole('region', { name: 'Piece c details' });
    expect(within(detail).getByText('Concept')).toBeTruthy();
  });
});

describe('AllowanceBadge', () => {
  it('renders the allowance copy', () => {
    render(<AllowanceBadge allowance={{ remaining: 'unlimited', nextCreditAt: null }} />);
    expect(screen.getByText('Unlimited')).toBeTruthy();
  });
});
