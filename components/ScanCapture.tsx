'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import ui from '@/components/ui.module.css';
import s from '@/components/scan.module.css';
import type { RecentScan } from '@/lib/ui/recentScans';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

type Props = {
  working: boolean;
  /** The live step while working, e.g. "Reading the garment". */
  step: string | null;
  /** The picked photo, shown in the viewfinder while it is read. */
  preview: string | null;
  recent: RecentScan[];
  onFile: (file: File) => void;
  onOpenRecent: (scan: RecentScan) => void;
};

function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
}

/**
 * The scan screen's capture area: a viewfinder (drop target, photo preview, scan line and live step),
 * the recent-scans strip, and a Photo / Upload switch with one shutter button.
 */
export function ScanCapture({ working, step, preview, recent, onFile, onOpenRecent }: Props) {
  const [mode, setMode] = useState<'photo' | 'upload'>('photo');
  const [dragging, setDragging] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);

  function picked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (file) onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (working) return;
    const file = e.dataTransfer?.files?.[0];
    if (file && isImage(file)) onFile(file);
  }

  return (
    <div className={s.capture}>
      <div
        className={s.finder}
        role="group"
        aria-label="Garment photo"
        data-dragging={dragging || undefined}
        onDragOver={(e) => { e.preventDefault(); if (!working) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <span key={c} className={`${s.corner} ${s[c]}`} data-corner aria-hidden="true" />
        ))}

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={preview} alt="Your garment photo" data-preview className={s.preview} />
        ) : (
          <div className={s.empty}>
            <UploadIcon />
            <p className={s.emptyTitle}>Drop a photo here</p>
            <p className={s.emptyHint}>Lay the piece flat or hang it in good light. The garment only, no faces, please.</p>
          </div>
        )}

        {working ? (
          <>
            <span className={s.scanline} data-scanline aria-hidden="true" />
            <p className={s.pill} role="status" aria-live="polite">
              <span className={ui.pulse} aria-hidden="true" />
              {step ?? 'Working'}…
            </p>
          </>
        ) : null}
      </div>

      {recent.length ? (
        <section className={s.recent} aria-labelledby="recent-title">
          <div className={s.recentHead}>
            <h2 id="recent-title" className={s.recentTitle}>Recent scans</h2>
            <Link href="/closet" className={s.recentLink}>See closet</Link>
          </div>
          <ul className={s.recentList} aria-label="Recent scans">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={s.thumb}
                  aria-label={`Open ${r.name}`}
                  title={r.name}
                  disabled={working}
                  onClick={() => onOpenRecent(r)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                  <img src={r.thumb} alt="" data-cutout={r.isCutout || undefined} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={s.controls}>
        <div className={s.phoneControls} data-controls="phone">
          <div className={ui.seg} role="group" aria-label="Photo source">
            <button type="button" className={ui.choice} aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>Photo</button>
            <button type="button" className={ui.choice} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>Upload</button>
          </div>
          <button
            type="button"
            className={s.shutter}
            aria-label={mode === 'photo' ? 'Take a photo' : 'Upload a photo'}
            disabled={working}
            onClick={() => (mode === 'photo' ? camera.current : files.current)?.click()}
          >
            {mode === 'photo' ? <CameraIcon /> : <UploadIcon />}
          </button>
        </div>
        <div className={s.deskControls} data-controls="desk">
          <button type="button" className={ui.button} disabled={working} onClick={() => files.current?.click()}>
            Choose a photo
          </button>
          <span className={s.deskHint}>or drop it on the frame</span>
        </div>
        <input ref={camera} id="garment-camera" className={s.fileInput} type="file" accept={ACCEPT} capture="environment" tabIndex={-1} aria-hidden="true" onChange={picked} disabled={working} />
        <input ref={files} id="garment-photo" className={s.fileInput} type="file" accept={ACCEPT} tabIndex={-1} aria-hidden="true" onChange={picked} disabled={working} />
      </div>
    </div>
  );
}

/** One line-icon size and stroke for the capture area. */
function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
