// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toPng = vi.fn();
vi.mock('html-to-image', () => ({ toPng: (...a: unknown[]) => toPng(...a) }));

import { StoryCard, type StoryCardData } from '@/components/StoryCard';

const data = (over: Partial<StoryCardData> = {}): StoryCardData => ({
  scanId: 'scan-1', garmentType: 'shirt', fabric: 'linen', recipeTitle: 'Crop it', difficulty: 'beginner',
  history: [], isConcept: false, imageUrl: null, ...over,
});
const hist = [{ title: 'The Breton shirt', sources: [{ citation: 'Museum of Textiles, 2019', url: 'https://example.org/a' }, { citation: 'Naval Archive', url: 'https://example.org/b' }] }];

afterEach(() => { cleanup(); toPng.mockReset(); vi.unstubAllGlobals(); });

describe('StoryCard', () => {
  it('shows the empty-history copy and no source line without history', () => {
    render(<StoryCard {...data()} />);
    expect(screen.getByText('No verified history for this piece yet.')).toBeTruthy();
    expect(screen.queryByText(/Source:/)).toBeNull();
    expect(screen.getByText('REVIVO')).toBeTruthy();
    expect(screen.getByText('Shirt')).toBeTruthy();
    expect(screen.getByText('Linen')).toBeTruthy();
  });

  it('renders every source citation as plain text', () => {
    const { container } = render(<StoryCard {...data({ history: hist })} />);
    expect(screen.getByText(/Museum of Textiles, 2019/)).toBeTruthy();
    expect(screen.getByText(/Naval Archive/)).toBeTruthy();
    expect(container.querySelectorAll('a[href]').length).toBe(0);
  });

  it('labels concept images', () => {
    render(<StoryCard {...data({ isConcept: true, imageUrl: 'https://x/y.png' })} />);
    expect(screen.getByText('Concept')).toBeTruthy();
  });

  it('downloads revivo-story-{scanId}.png through a Blob URL', async () => {
    toPng.mockResolvedValue('data:image/png;base64,AAAA');
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x']) })));
    const create = vi.fn(() => 'blob:abc'); const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StoryCard {...data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:abc'));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('shows a friendly inline error when conversion fails', async () => {
    toPng.mockRejectedValue(new Error('tainted'));
    render(<StoryCard {...data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't create the image. Please try again.");
  });
});
