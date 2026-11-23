// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ModelFigure } from '@/components/ModelFigure';
import { dollLayout, resolveDots, type Slot } from '@/lib/domain/slots';

afterEach(cleanup);

const pieces: { id: string; slot: Slot; name: string; imageUrl: string | null; concept: boolean }[] = [
  { id: 'a', slot: 'top', name: 'Striped shirt', imageUrl: 'https://x/a.png', concept: false },
  { id: 'b', slot: 'bottom', name: 'Wide trousers', imageUrl: null, concept: true },
];
const pct = (s: string) => parseFloat(s);

describe('ModelFigure', () => {
  it('places one layer per piece in its slot box', () => {
    const { container } = render(<ModelFigure pieces={pieces} showDots={false} />);
    const layout = dollLayout(pieces);
    const layers = container.querySelectorAll<HTMLElement>('[data-piece]');
    expect(layers.length).toBe(2);
    for (const el of layers) {
      const b = layout[el.dataset.piece!];
      expect(pct(el.style.left)).toBeCloseTo(b.x * 100);
      expect(pct(el.style.top)).toBeCloseTo(b.y * 100);
      expect(pct(el.style.width)).toBeCloseTo(b.w * 100);
      expect(pct(el.style.height)).toBeCloseTo(b.h * 100);
    }
  });

  it('shows numbered dots at resolved positions and reports clicks', () => {
    const onDot = vi.fn();
    render(<ModelFigure pieces={pieces} showDots onDot={onDot} />);
    const dots = resolveDots(pieces, null);
    const first = screen.getByRole('button', { name: '1, Striped shirt' });
    const second = screen.getByRole('button', { name: '2, Wide trousers' });
    expect(pct(first.style.left)).toBeCloseTo(dots.a.x * 100);
    expect(pct(first.style.top)).toBeCloseTo(dots.a.y * 100);
    expect(pct(second.style.left)).toBeCloseTo(dots.b.x * 100);
    fireEvent.click(second);
    expect(onDot).toHaveBeenCalledWith('b');
  });

  it('has no dot buttons without showDots', () => {
    render(<ModelFigure pieces={pieces} showDots={false} />);
    expect(screen.queryAllByRole('button').length).toBe(0);
  });

  it('badges concept pieces', () => {
    render(<ModelFigure pieces={pieces} showDots={false} />);
    expect(screen.getAllByText('Concept').length).toBe(1);
  });

  it('hides the drawn model from assistive tech', () => {
    const { container } = render(<ModelFigure pieces={pieces} showDots={false} />);
    expect(container.querySelector('svg[data-model]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('spins when spinKey changes and clears on animationend', () => {
    const { container, rerender } = render(<ModelFigure pieces={pieces} showDots={false} spinKey={0} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-spin')).not.toBe('true');
    rerender(<ModelFigure pieces={pieces} showDots={false} spinKey={1} />);
    expect(root.getAttribute('data-spin')).toBe('true');
    fireEvent.animationEnd(root);
    expect(root.getAttribute('data-spin')).not.toBe('true');
  });
});
