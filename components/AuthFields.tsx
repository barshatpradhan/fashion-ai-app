'use client';
import { useState } from 'react';
import { passwordRules } from '@/lib/auth/flows';
import a from './auth.module.css';

type Base = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
};

const describedBy = (id: string, error?: string, extra?: string) =>
  [error ? `${id}-error` : '', extra ?? ''].filter(Boolean).join(' ') || undefined;

/** Labelled input with its error directly underneath, linked by aria-describedby. */
export function TextField({ id, label, value, onChange, autoComplete, error, hint, disabled, required, type = 'text', maxLength }: Base & { type?: 'text' | 'email'; maxLength?: number }) {
  return (
    <div className={a.field}>
      <label htmlFor={id} className={a.label}>{label}</label>
      {hint ? <p id={`${id}-hint`} className={a.hint}>{hint}</p> : null}
      <input
        id={id}
        className={a.input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint ? `${id}-hint` : undefined)}
        spellCheck={false}
      />
      {error ? <p id={`${id}-error`} className={a.error}>{error}</p> : null}
    </div>
  );
}

/** Password input with a show/hide toggle and, for new passwords, the rules ticking off as you type. */
export function PasswordField({ id, label, value, onChange, autoComplete, error, disabled, required, showRules }: Base & { showRules?: boolean }) {
  const [visible, setVisible] = useState(false);
  const rules = showRules ? passwordRules(value) : [];
  return (
    <div className={a.field}>
      <label htmlFor={id} className={a.label}>{label}</label>
      <div className={a.inputRow}>
        <input
          id={id}
          className={`${a.input} ${a.withToggle}`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, showRules ? `${id}-rules` : undefined)}
          autoCapitalize="none"
          spellCheck={false}
        />
        <button
          type="button"
          className={a.toggle}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
        >
          {visible ? 'Hide password' : 'Show password'}
        </button>
      </div>
      {showRules ? (
        <ul id={`${id}-rules`} className={a.rules} aria-live="polite">
          {rules.map((r) => (
            <li key={r.id} data-met={r.met}>
              <span aria-hidden="true">{r.met ? '✓' : '·'}</span> {r.label}
              <span className={a.visuallyHidden}>{r.met ? ' (done)' : ' (not yet)'}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p id={`${id}-error`} className={a.error}>{error}</p> : null}
    </div>
  );
}
