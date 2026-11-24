// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { ScanCapture } from '@/components/ScanCapture';
import type { RecentScan } from '@/lib/ui/recentScans';

afterEach(cleanup);

const recent: RecentScan[] = [
  { id: 'a', name: 'Denim jacket', thumb: 'https://t/a.png', isCutout: true, source: { imagePath: 'u/a.jpg', cutoutPath: 'u/a-c.png', imageHash: 'h1' } },
  { id: 'b', name: 'Striped shirt', thumb: 'https://t/b.jpg', isCutout: false, source: { imagePath: 'u/b.jpg', cutoutPath: 'u/b.jpg', imageHash: 'h2' } },
];

function setup(over: Partial<React.ComponentProps<typeof ScanCapture>> = {}) {
  const onFile = vi.fn();
  const onOpenRecent = vi.fn();
  const utils = render(<ScanCapture working={false} step={null} preview={null} recent={[]} onFile={onFile} onOpenRecent={onOpenRecent} {...over} />);
  return { ...utils, onFile, onOpenRecent };
}

describe('ScanCapture', () => {
  it('shows an empty viewfinder that invites a photo', () => {
    const { container } = setup();
    expect(screen.getByText('Click to upload a photo')).toBeTruthy();
    expect(container.querySelectorAll('[data-corner]')).toHaveLength(4);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clicking the empty viewfinder opens the picker for the chosen source', () => {
    const { container } = setup();
    const camera = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    const files = container.querySelector('input#garment-photo') as HTMLInputElement;
    const camClick = vi.spyOn(camera, 'click');
    const fileClick = vi.spyOn(files, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Add a photo' }));
    expect(camClick).toHaveBeenCalledTimes(1); // Photo is the default source (camera on phones, picker elsewhere)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a photo' }));
    expect(fileClick).toHaveBeenCalledTimes(1);
  });

  it('the viewfinder is not a button while a photo is being read', () => {
    setup({ working: true, step: 'Reading the garment', preview: 'blob:x' });
    expect(screen.queryByRole('button', { name: 'Add a photo' })).toBeNull();
  });

  it('switches the shutter between camera and file picker', () => {
    const { container } = setup();
    const camera = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    const files = container.querySelector('input#garment-photo') as HTMLInputElement;
    expect(camera).toBeTruthy();
    expect(files.hasAttribute('capture')).toBe(false);
    const camClick = vi.spyOn(camera, 'click');
    const fileClick = vi.spyOn(files, 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(camClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('button', { name: 'Upload' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Upload a photo' }));
    expect(fileClick).toHaveBeenCalledTimes(1);
  });

  it('on wider screens, one Choose a photo button opens the file picker', () => {
    const { container } = setup();
    const files = container.querySelector('input#garment-photo') as HTMLInputElement;
    const fileClick = vi.spyOn(files, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(fileClick).toHaveBeenCalledTimes(1);
    // Phone and desktop controls are separate groups so CSS can show the right one.
    expect(container.querySelector('[data-controls="phone"]')).toBeTruthy();
    expect(container.querySelector('[data-controls="desk"]')).toBeTruthy();
  });

  it('hands a picked or dropped file to onFile', () => {
    const { container, onFile } = setup();
    const file = new File(['x'], 'jacket.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input#garment-photo')!, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);

    const drop = screen.getByRole('group', { name: 'Garment photo' });
    fireEvent.drop(drop, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledTimes(2);
  });

  it('ignores a dropped file that is not an image', () => {
    const { onFile } = setup();
    fireEvent.drop(screen.getByRole('group', { name: 'Garment photo' }), { dataTransfer: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  it('while working: shows the photo, the scan line and the live step, and locks the controls', () => {
    const { container } = setup({ working: true, step: 'Reading the garment', preview: 'blob:x' });
    expect(screen.getByRole('status').textContent).toContain('Reading the garment');
    expect(container.querySelector('img[data-preview]')?.getAttribute('src')).toBe('blob:x');
    expect(container.querySelector('[data-scanline]')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Take a photo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists recent scans that reopen on tap, and hides the strip when there are none', () => {
    const { onOpenRecent, unmount } = setup({ recent });
    const list = screen.getByRole('list', { name: 'Recent scans' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open Striped shirt' }));
    expect(onOpenRecent).toHaveBeenCalledWith(recent[1]);
    expect(screen.getByRole('link', { name: 'See closet' }).getAttribute('href')).toBe('/closet');
    unmount();
    setup();
    expect(screen.queryByRole('list', { name: 'Recent scans' })).toBeNull();
  });

  it('stops the scan line for reduced motion', () => {
    const css = readFileSync('components/scan.module.css', 'utf8');
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{[^]*\.scanline[^}]*animation:\s*none/);
  });
});
