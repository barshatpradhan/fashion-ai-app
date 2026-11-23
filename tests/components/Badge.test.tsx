// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Badge, type BadgeVariant } from '@/components/Badge';
import { Button } from '@/components/Button';

afterEach(cleanup);

describe('Badge', () => {
  const fixed: [BadgeVariant, string][] = [
    ['concept', 'Concept'],
    ['premium', 'Premium'],
    ['reworked', 'Reworked'],
    ['accessory', 'Accessory'],
  ];

  it.each(fixed)('%s renders its label "%s"', (variant, label) => {
    const { container } = render(<Badge variant={variant} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.firstElementChild?.getAttribute('data-variant')).toBe(variant);
  });

  it('concept always reads "Concept", whatever children are passed', () => {
    render(<Badge variant="concept">Photo</Badge>);
    expect(screen.getByText('Concept')).toBeTruthy();
    expect(screen.queryByText('Photo')).toBeNull();
  });

  it('allowance and neutral render their own text', () => {
    render(
      <>
        <Badge variant="allowance" as="p">3 uploads left</Badge>
        <Badge variant="neutral">Before</Badge>
      </>,
    );
    expect(screen.getByText('3 uploads left').tagName).toBe('P');
    expect(screen.getByText('Before')).toBeTruthy();
  });

  it('premium carries a decorative lock icon', () => {
    const { container } = render(<Badge variant="premium" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a positioning class passed in', () => {
    const { container } = render(<Badge variant="concept" className="pos" />);
    expect(container.firstElementChild?.className).toContain('pos');
  });
});

describe('Button loading state', () => {
  it('is busy and disabled while loading, keeping its label', () => {
    render(<Button loading>Saving…</Button>);
    const b = screen.getByRole('button', { name: 'Saving…' });
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('is not busy when idle, and defaults to type="button"', () => {
    render(<Button>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.hasAttribute('aria-busy')).toBe(false);
    expect((b as HTMLButtonElement).disabled).toBe(false);
    expect(b.getAttribute('type')).toBe('button');
  });

  it('stays disabled when disabled is set without loading', () => {
    render(<Button disabled>Save</Button>);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
