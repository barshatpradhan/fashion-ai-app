'use client';
import { useState, type FormEvent } from 'react';
import { FABRICS } from '@/lib/domain/vocabulary';
import s from './result.module.css';

type Props = {
  fabric: string;
  garmentType: string;
  busy: boolean;
  error?: string | null;
  onSave: (field: 'fabric' | 'garment_type', value: string) => Promise<boolean>;
};

/** Always-available correction of the fabric (from the fixed list) or the garment type (free text). */
export function EditGarment({ fabric, garmentType, busy, error, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [fabricValue, setFabricValue] = useState((FABRICS as readonly string[]).includes(fabric) ? fabric : '');
  const [typeValue, setTypeValue] = useState(garmentType);

  async function save(e: FormEvent, field: 'fabric' | 'garment_type', value: string) {
    e.preventDefault();
    if (!value.trim()) return;
    if (await onSave(field, value.trim())) setOpen(false);
  }

  return (
    <div>
      <p style={{ marginTop: 16 }}>
        <button type="button" className={s.choice} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Not right? Edit fabric / type
        </button>
      </p>
      {open ? (
        <div className={s.prompt} role="group" aria-label="Edit fabric or garment type">
          <form className={s.choices} onSubmit={(e) => void save(e, 'fabric', fabricValue)}>
            <label htmlFor="edit-fabric" className={s.visuallyHidden}>Fabric</label>
            <select
              id="edit-fabric"
              className={s.choice}
              value={fabricValue}
              onChange={(e) => setFabricValue(e.target.value)}
              disabled={busy}
            >
              <option value="" disabled>Choose a fabric</option>
              {FABRICS.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
            </select>
            <button type="submit" className={`${s.choice} ${s.choicePrimary}`} disabled={busy || !fabricValue}>Save fabric</button>
          </form>
          <form className={s.choices} style={{ marginTop: 12 }} onSubmit={(e) => void save(e, 'garment_type', typeValue)}>
            <label htmlFor="edit-type" className={s.visuallyHidden}>Garment type</label>
            <input
              id="edit-type"
              className={s.choice}
              value={typeValue}
              maxLength={60}
              onChange={(e) => setTypeValue(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className={`${s.choice} ${s.choicePrimary}`} disabled={busy || !typeValue.trim()}>Save type</button>
          </form>
          {error ? <p className={s.note} role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
