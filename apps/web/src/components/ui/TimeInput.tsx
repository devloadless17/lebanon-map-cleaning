'use client';

import { useEffect, useState } from 'react';
import { formatClock, parseClock } from '@/lib/time';
import { Input } from './primitives';

interface Props {
  value: number;
  onCommit: (minutes: number) => void;
  'aria-label'?: string;
}

/**
 * A clock field that commits as soon as what you typed is a valid time.
 *
 * Committing on blur instead looks fine until someone types a new window and clicks straight
 * through to Book: the field shows the new time while the draft still holds the old one, and
 * the booking is made against a window the scheduler never chose. Keeping the half-typed text
 * in local state is what lets us commit eagerly without fighting the user over "1" or "16:".
 */
export function TimeInput({ value, onCommit, 'aria-label': ariaLabel }: Props) {
  const [text, setText] = useState(() => formatClock(value));

  // Re-sync when the value changes from elsewhere, but never while the user is mid-edit.
  useEffect(() => {
    setText((current) => (parseClock(current) === value ? current : formatClock(value)));
  }, [value]);

  return (
    <Input
      value={text}
      aria-label={ariaLabel}
      inputMode="numeric"
      placeholder="9:00 AM"
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const minutes = parseClock(next);
        if (minutes !== null) onCommit(minutes);
      }}
      onBlur={() => setText(formatClock(value))}
    />
  );
}
