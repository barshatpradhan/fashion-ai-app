'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';
import { isLockedRecipe, type PublicMatch } from '@/lib/domain/redact';
import { messageForError } from '@/lib/ui/messages';
import { fabricChoices, featureLabels, firstSentence, humanize, safeUrl, splitRecipes, verifiedHistory } from '@/lib/ui/result';
import { HeroGarment } from './HeroGarment';
import { Swatches } from './Swatches';
import { FabricConfirm } from './FabricConfirm';
import { StyleQuestion } from './StyleQuestion';
import { UpgradeButton } from './UpgradeButton';
import { LockedRecipeCard } from './LockedRecipeCard';
import { AddToCloset } from './AddToCloset';
import { EditGarment } from './EditGarment';
import s from './result.module.css';

export type AnalyzeResponse = {
  scanId: string;
  vision: VisionResult;
  /** Server-redacted: Recipes the user cannot open arrive as LockedRecipe (no body or steps). */
  match: PublicMatch;
  needsFabricConfirm: boolean;
  /** Effective fabric (latest correction, else the vision guess). Older responses may omit it. */
  fabric?: string;
};

/** The uploaded images behind this result: re-POSTing them to /api/analyze is a free hash-cache hit. */
export type ScanSource = { imagePath: string; cutoutPath: string; imageHash: string };

type Props = { result: AnalyzeResponse; heroSrc: string; isCutout: boolean; source?: ScanSource };

type CorrectBody = { scanId: string; field: 'fabric' | 'garment_type' | 'named_style'; value: string; accept?: boolean };

async function postCorrect(body: CorrectBody): Promise<{ match: PublicMatch; needsFabricConfirm: boolean }> {
  const res = await fetch('/api/correct', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; match?: PublicMatch; needsFabricConfirm?: boolean };
  if (!res.ok || !json.match) throw new Error(json.error ?? 'server_error');
  return { match: json.match, needsFabricConfirm: json.needsFabricConfirm === true };
}

export function ResultView({ result, heroSrc, isCutout, source }: Props) {
  const { scanId, vision } = result;
  const [match, setMatch] = useState(result.match);
  const [needsConfirm, setNeedsConfirm] = useState(result.needsFabricConfirm);
  const [fabric, setFabric] = useState(result.fabric ?? vision.fabric_guess.value);
  const [garmentType, setGarmentType] = useState(vision.garment_type);
  const [busy, setBusy] = useState(false);
  const [fabricError, setFabricError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [styleError, setStyleError] = useState<{ style: string; message: string } | null>(null);

  /** After an upgrade: re-read this same scan (hash-cache hit, no AI call or cap) so the result stays on screen. */
  async function refreshAfterUpgrade() {
    if (!source) return window.location.reload();
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(source),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<AnalyzeResponse>;
      if (!res.ok || !json.match) throw new Error('refresh failed');
      setMatch(json.match);
      if (typeof json.needsFabricConfirm === 'boolean') setNeedsConfirm(json.needsFabricConfirm);
    } catch (err) {
      console.error('result refresh after upgrade failed', err);
      window.location.reload();
    }
  }

  async function editGarment(field: 'fabric' | 'garment_type', value: string): Promise<boolean> {
    setBusy(true);
    setEditError(null);
    try {
      const r = await postCorrect({ scanId, field, value });
      setMatch(r.match);
      setNeedsConfirm(r.needsFabricConfirm);
      if (field === 'fabric') setFabric(value);
      else setGarmentType(value);
      return true;
    } catch (err) {
      setEditError(messageForError((err as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmFabric(value: string) {
    setBusy(true);
    setFabricError(null);
    try {
      const r = await postCorrect({ scanId, field: 'fabric', value });
      setMatch(r.match);
      setNeedsConfirm(r.needsFabricConfirm);
      setFabric(value);
    } catch (err) {
      setFabricError(messageForError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function answerStyle(style: string, accept: boolean) {
    setBusy(true);
    setStyleError(null);
    try {
      const r = await postCorrect({ scanId, field: 'named_style', value: style, accept });
      setMatch(r.match);
      setNeedsConfirm(r.needsFabricConfirm);
    } catch (err) {
      setStyleError({ style, message: messageForError((err as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  const history = verifiedHistory(match.history);
  const { free, others } = splitRecipes(match.recipes, match.freeRecipeId);
  const fabricNote = match.fabricNotes[0];
  const garmentName = humanize(garmentType);

  return (
    <div>
      <HeroGarment
        src={heroSrc}
        alt={`Your ${garmentType}`}
        fabric={fabric}
        features={featureLabels(vision)}
        isCutout={isCutout}
      />

      <div className={s.heading}>
        <div>
          <p className={s.eyebrow}>{humanize(fabric)}</p>
          <h1 className={s.garmentName}>{garmentName}</h1>
        </div>
        <Swatches colors={vision.colors} />
      </div>

      <AddToCloset scanId={scanId} />

      <EditGarment fabric={fabric} garmentType={garmentType} busy={busy} error={editError} onSave={editGarment} />

      {needsConfirm ? (
        <FabricConfirm
          choices={fabricChoices(vision.fabric_guess.value, vision.fabric_guess.alternatives)}
          busy={busy}
          error={fabricError}
          onConfirm={confirmFabric}
        />
      ) : null}

      {match.styleQuestions.map((q) => (
        <StyleQuestion
          key={q.style}
          style={q.style}
          busy={busy}
          error={styleError?.style === q.style ? styleError.message : null}
          onAnswer={answerStyle}
        />
      ))}

      <section className={s.section} aria-labelledby="history-title">
        <h2 id="history-title" className={s.sectionTitle}>History</h2>
        {history.length ? (
          <div className={s.grid}>
            {history.map((h) => <HistoryCard key={h.id} entry={h} />)}
          </div>
        ) : (
          <p className={s.empty}>No verified history for this piece yet.</p>
        )}
        {fabricNote ? (
          <p className={s.cardBody} style={{ marginTop: 20, maxWidth: '62ch' }}>
            <strong>About {fabric}.</strong> {firstSentence(fabricNote.body)}
          </p>
        ) : null}
      </section>

      {match.recipes.length ? (
        <section className={s.section} aria-labelledby="recipes-title">
          <h2 id="recipes-title" className={s.sectionTitle}>Give it a second life</h2>
          <div className={s.grid}>
            {free && !isLockedRecipe(free) ? <RecipeCard entry={free} scanId={scanId} free /> : null}
            {others.map((r) =>
              isLockedRecipe(r) ? (
                <LockedRecipeCard key={r.id} title={r.title} difficulty={r.difficulty} teaser={r.teaser} />
              ) : (
                <RecipeCard key={r.id} entry={r} scanId={scanId} />
              ),
            )}
          </div>
          {others.some(isLockedRecipe) ? (
            <p style={{ marginTop: 20 }}><UpgradeButton label="Unlock every Recipe · $7.99/month" onUpgraded={() => void refreshAfterUpgrade()} /></p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function HistoryCard({ entry }: { entry: KbEntry }) {
  const sources = (entry.sources ?? []).flatMap((src) => {
    const url = safeUrl(src.url);
    return url ? [{ ...src, url }] : [];
  });
  return (
    <article className={s.card}>
      <h3 className={s.cardTitle}>{entry.title}</h3>
      <p className={s.cardBody}>{entry.body}</p>
      <ul className={s.sources} aria-label="Sources">
        {sources.map((src) => (
          <li key={src.url}>
            Source:{' '}
            <a href={src.url} target="_blank" rel="noopener noreferrer">{src.citation}</a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RecipeCard({ entry, scanId, free = false }: { entry: KbEntry; scanId: string; free?: boolean }) {
  return (
    <article className={`${s.card} ${free ? s.cardFree : ''}`}>
      {entry.difficulty ? <span className={s.tag}>{humanize(entry.difficulty)}</span> : null}
      <h3 className={s.cardTitle}>{entry.title}</h3>
      <p className={s.cardBody}>{entry.body}</p>
      {entry.tools?.length ? <p className={s.cardBody}>Tools: {entry.tools.join(', ')}</p> : null}
      <Link className={s.cardLink} href={`/guide/${encodeURIComponent(scanId)}/${encodeURIComponent(entry.id)}`}>
        {free ? 'Open the free guide' : 'Open guide'} →
      </Link>
    </article>
  );
}
