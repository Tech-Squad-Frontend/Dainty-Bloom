'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { api, ApiError } from '@/lib/api/client';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="auth-page"><p role="status">Verifying email…</p></main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [message, setMessage] = useState(
    token ? 'Verifying email…' : 'The verification link is missing or invalid.',
  );
  const [failed, setFailed] = useState(!token);

  useEffect(() => {
    if (!token) return;
    api
      .verifyEmail(token)
      .then((result) => setMessage(result.message))
      .catch((error) => {
        setFailed(true);
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'The verification link could not be completed.',
        );
      });
  }, [token]);

  return (
    <main className="auth-page">
      <section className="auth-form-content" aria-live="polite">
        <p className="auth-kicker">Email verification</p>
        <h1>{failed ? 'Unable to verify' : 'Email status'}</h1>
        <p className="auth-intro">{message}</p>
        <Link href="/">Continue to Dainty Bloom</Link>
      </section>
    </main>
  );
}
