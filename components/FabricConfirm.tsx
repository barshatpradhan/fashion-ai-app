'use client';
import ui from './ui.module.css';
import s from './result.module.css';

type Props = {
  choices: string[];
  busy: boolean;
  error?: string | null;
  onConfirm: (fabric: string) => void;
};

/** Low-confidence fabric guess: one tap confirms or corrects it. The first choice is the AI's guess. */
export function FabricConfirm({ choices, busy, error, onConfirm }: Props) {
  if (!choices.length) return null;
  return (
    <div className={s.prompt} role="group" aria-labelledby="fabric-confirm-q">
      <p id="fabric-confirm-q" className={s.promptQuestion}>Which fabric is it?</p>
      <div className={ui.choices}>
        {choices.map((c, i) => (
          <button
            key={c}
            type="button"
            className={`${ui.choice} ${i === 0 ? ui.choicePrimary : ''}`}
            disabled={busy}
            onClick={() => onConfirm(c)}
          >
            {c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      {error ? <p className={ui.note} role="alert">{error}</p> : null}
    </div>
  );
}
