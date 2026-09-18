'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { beirutToday } from '@/lib/time';

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      router.push(`/schedule/${beirutToday()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold tracking-tight">Cleaning Route</h1>
        <p className="mt-1 text-sm text-ink-muted">Sign in to plan the day.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          {error ? (
            <p className="rounded-md bg-bad-soft px-2.5 py-2 text-sm text-bad">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
