// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { PasswordField, TextField } from '@/components/AuthFields';

afterEach(() => cleanup());

function Pw(props: { rules?: boolean; error?: string }) {
  const [v, setV] = useState('');
  return <PasswordField id="pw" label="Password" value={v} onChange={setV} autoComplete="new-password" showRules={props.rules} error={props.error} />;
}

describe('PasswordField', () => {
  it('is a labelled password input with the given autocomplete', () => {
    render(<Pw />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('new-password');
  });

  it('the toggle shows and hides the password', () => {
    render(<Pw />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
  });

  it('the toggle is not a submit button', () => {
    render(<Pw />);
    expect((screen.getByRole('button', { name: 'Show password' }) as HTMLButtonElement).type).toBe('button');
  });

  it('shows the rules updating as the user types', () => {
    render(<Pw rules />);
    const rule = screen.getByText('At least 8 characters').closest('li')!;
    expect(rule.getAttribute('data-met')).toBe('false');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } });
    expect(screen.getByText('At least 8 characters').closest('li')!.getAttribute('data-met')).toBe('true');
  });

  it('puts its error next to the field and links it', () => {
    render(<Pw error="Use at least 8 characters." />);
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const id = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(id.split(' ')[0])?.textContent).toBe('Use at least 8 characters.');
  });
});

describe('TextField', () => {
  it('is labelled, keeps the given type and autocomplete, and links its error', () => {
    render(<TextField id="em" label="Email" type="email" autoComplete="email" value="x" onChange={() => {}} error="Enter a valid email address." />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.autocomplete).toBe('email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Enter a valid email address.');
  });
  it('without an error it is not marked invalid', () => {
    render(<TextField id="nm" label="Name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBeNull();
  });
});
