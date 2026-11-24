'use client';
import { humanize } from '@/lib/ui/result';
import ui from './ui.module.css';
import s from './result.module.css';

type Props = {
  style: string;
  busy: boolean;
  error?: string | null;
  onAnswer: (style: string, accept: boolean) => void;
};

export function StyleQuestion({ style, busy, error, onAnswer }: Props) {
  const id = `style-q-${style}`;
  return (
    <div className={s.prompt} role="group" aria-labelledby={id}>
      <p id={id} className={s.promptQuestion}>Is this {humanize(style)}?</p>
      <div className={ui.choices}>
        <button type="button" className={`${ui.choice} ${ui.choicePrimary}`} disabled={busy} onClick={() => onAnswer(style, true)}>
          Yes
        </button>
        <button type="button" className={ui.choice} disabled={busy} onClick={() => onAnswer(style, false)}>
          No
        </button>
      </div>
      {error ? <p className={ui.note} role="alert">{error}</p> : null}
    </div>
  );
}
