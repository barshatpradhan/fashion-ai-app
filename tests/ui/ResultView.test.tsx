// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ResultView, type AnalyzeResponse } from '@/components/ResultView';
import type { KbEntry } from '@/lib/domain/types';
import type { VisionResult } from '@/lib/ai/visionSchema';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const recipe = (id: string, difficulty: KbEntry['difficulty'], body: string): KbEntry =>
  ({ id, kind: 'redesign', title: `Recipe ${id}`, body, tags: [], difficulty, status: 'reviewed' });

const vision: VisionResult = {
  is_garment: true, garment_type: 'shirt', category: 'top', parts: { collar: 'point-collar' }, pattern: 'stripes',
  colors: [{ name: 'Navy', hex: '#1f2a44' }], fabric_guess: { value: 'linen', confidence: 0.5, alternatives: ['cotton', 'silk'] },
  condition_notes: '', visible_techniques: [], tags: [], named_styles: [{ style: 'breton-stripe', confidence: 0.6 }],
};

const base: AnalyzeResponse = {
  scanId: 'scan-1', vision, needsFabricConfirm: true, fabric: 'linen',
  match: {
    history: [], fabricNotes: [], freeRecipeId: 'a',
    // As the server sends it to a free user: 'b' is already redacted to a LockedRecipe.
    recipes: [recipe('a', 'beginner', 'Crop it. Then hem.'), { id: 'b', kind: 'redesign', title: 'Recipe b', difficulty: 'advanced', teaser: 'Rebuild the yoke.' }],
    styleQuestions: [{ style: 'breton-stripe', confidence: 0.6 }],
  },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ResultView', () => {
  it('renders the hero, swatches, prompts, empty history copy, free and locked recipes', () => {
    render(<ResultView result={base} heroSrc="blob:x" isCutout />);
    expect(screen.getByRole('img', { name: 'Your shirt' })).toBeTruthy();
    expect(screen.getByText('Navy')).toBeTruthy();
    expect(screen.getByText('Which fabric is it?')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Add to closet', 'Not right? Edit fabric / type', 'Linen', 'Cotton', 'Silk', 'Yes', 'No', 'Unlock every Recipe · $7.99/month']);
    expect(screen.getByText('Is this Breton stripe?')).toBeTruthy();
    expect(screen.getByText('No verified history for this piece yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open the free guide/i }).getAttribute('href')).toBe('/guide/scan-1/a');
    const locked = screen.getByRole('article', { name: 'Recipe b (Premium)' });
    expect(locked.textContent).toContain('Rebuild the yoke.');
    expect(locked.querySelector('a')).toBeNull();
  });

  it('unredacted recipes (premium response) get open cards', () => {
    const full = { ...base, match: { ...base.match, recipes: [recipe('a', 'beginner', 'Crop it.'), recipe('b', 'advanced', 'Rebuild the yoke. Long steps follow.')] } };
    render(<ResultView result={full} heroSrc="blob:x" isCutout />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/guide/scan-1/a', '/guide/scan-1/b']);
  });

  it('history shows its sources', () => {
    const h: KbEntry = { id: 'h', kind: 'history', title: 'The Breton shirt', body: 'Navy issue, 1858.', tags: [], status: 'reviewed',
      sources: [{ citation: 'Museum record', url: 'https://example.org/breton', accessed: '2026-11-01' }] };
    render(<ResultView result={{ ...base, match: { ...base.match, history: [h] } }} heroSrc="blob:x" isCutout />);
    expect(screen.getByRole('link', { name: 'Museum record' }).getAttribute('href')).toBe('https://example.org/breton');
    expect(screen.queryByText('No verified history for this piece yet.')).toBeNull();
  });

  it('confirming a fabric posts a correction and hides the prompt', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ match: base.match, needsFabricConfirm: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ResultView result={base} heroSrc="blob:x" isCutout />);
    fireEvent.click(screen.getByRole('button', { name: 'Cotton' }));
    await waitFor(() => expect(screen.queryByText('Which fabric is it?')).toBeNull());
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ scanId: 'scan-1', field: 'fabric', value: 'cotton' });
  });

  it('the edit control is always available and corrects the garment type', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ match: base.match, needsFabricConfirm: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ResultView result={{ ...base, needsFabricConfirm: false }} heroSrc="blob:x" isCutout />);
    fireEvent.click(screen.getByRole('button', { name: 'Not right? Edit fabric / type' }));
    fireEvent.change(screen.getByLabelText('Garment type'), { target: { value: 'Blouse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Blouse'));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ scanId: 'scan-1', field: 'garment_type', value: 'Blouse' });
  });

  it('the edit control corrects a confidently-wrong fabric from the fabric list', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ match: base.match, needsFabricConfirm: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sure = { ...base, needsFabricConfirm: false, vision: { ...vision, fabric_guess: { ...vision.fabric_guess, confidence: 0.95 } } };
    render(<ResultView result={sure} heroSrc="blob:x" isCutout />);
    fireEvent.click(screen.getByRole('button', { name: 'Not right? Edit fabric / type' }));
    fireEvent.change(screen.getByLabelText('Fabric'), { target: { value: 'wool' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save fabric' }));
    await waitFor(() => expect(screen.getByText('Wool', { selector: 'p' })).toBeTruthy());
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ scanId: 'scan-1', field: 'fabric', value: 'wool' });
  });

  it('upgrading from the result re-fetches the same scan instead of reloading the page', async () => {
    const unlocked = { ...base.match, recipes: [recipe('a', 'beginner', 'Crop it.'), recipe('b', 'advanced', 'Rebuild the yoke. Long steps follow.')] };
    const fetchMock = vi.fn(async (url: string) => url === '/api/premium'
      ? new Response(JSON.stringify({ isPremium: true }), { status: 200 })
      : new Response(JSON.stringify({ ...base, match: unlocked }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const source = { imagePath: 'u/1.jpg', cutoutPath: 'u/1-cutout.png', imageHash: 'h' };
    render(<ResultView result={base} heroSrc="blob:x" isCutout source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock every Recipe · $7.99/month' }));
    await waitFor(() => expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/guide/scan-1/a', '/guide/scan-1/b']));
    const analyze = (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u === '/api/analyze')!;
    expect(JSON.parse(analyze[1].body as string)).toEqual(source);
    expect(reload).not.toHaveBeenCalled();
  });
});
