'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api/client';

const adminLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;

export function AdminLoginForm() {
  return (
    <Suspense
      fallback={
        <p className="auth-loading" role="status">
          Loading staff sign in…
        </p>
      }
    >
      <AdminLoginFormContent />
    </Suspense>
  );
}

function AdminLoginFormContent() {
  const { login, user } = useAuth();
  const router = useRouter();
  const errorId = useId();
  const [visible, setVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [challengePurpose, setChallengePurpose] = useState<'login' | 'setup'>();
  const [mfaCode, setMfaCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginValues>({ resolver: zodResolver(adminLoginSchema) });

  const submit = handleSubmit(async (values) => {
    setErrorMessage('');
    try {
      const result = await login({ ...values, portal: 'admin' });
      if (result.mfaRequired && result.challenge) {
        setChallengeId(result.challenge.id);
        setChallengePurpose(result.challenge.purpose);
        if (result.challenge.purpose === 'setup') {
          const enrollment = await api.startMfaEnrollment(result.challenge.id);
          setQrCodeDataUrl(enrollment.qrCodeDataUrl);
          setMfaSecret(enrollment.secret);
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Staff sign in could not be completed.',
      );
    }
  });

  if (user && user.role !== 'customer') {
    return (
      <p className="auth-loading" role="status">
        Checking staff access…
      </p>
    );
  }

  if (challengeId) {
    const submitMfa = async (event: FormEvent) => {
      event.preventDefault();
      setErrorMessage('');
      try {
        if (challengePurpose === 'setup') {
          await api.confirmMfaEnrollment(challengeId, mfaCode);
        } else {
          await api.verifyMfa(challengeId, mfaCode);
        }
        router.replace('/admin');
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'MFA verification could not be completed.',
        );
      }
    };
    return (
      <section className="auth-form-content">
        <p className="auth-kicker">MFA verification</p>
        <h1>{challengePurpose === 'setup' ? 'Set up an authenticator' : 'Enter a verification code'}</h1>
        {challengePurpose === 'setup' ? (
          <>
            {qrCodeDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCodeDataUrl} alt="Dainty Bloom authenticator QR code" />
            ) : null}
            <p className="auth-intro">
              Scan the QR code or enter this setup key: <strong>{mfaSecret}</strong>
            </p>
          </>
        ) : (
          <p className="auth-intro">Enter the 6-digit code from your authenticator app or use a recovery code.</p>
        )}
        {errorMessage ? (
          <div className="auth-alert" id={errorId} role="alert">
            {errorMessage}
          </div>
        ) : null}
        <form className="auth-form" onSubmit={submitMfa}>
          <Input
            label="Verification code"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            autoComplete="one-time-code"
          />
          <Button type="submit">Continue</Button>
        </form>
      </section>
    );
  }

  return (
    <section className="auth-form-content">
      <p className="auth-kicker">STAFF WORKSPACE</p>
      <h1>Welcome back</h1>
      <p className="auth-intro">Sign in to your Dainty Bloom workspace.</p>
      {errorMessage ? (
        <div className="auth-alert" id={errorId} role="alert">
          {errorMessage}
        </div>
      ) : null}
      <form
        className="auth-form"
        aria-describedby={errorMessage ? errorId : undefined}
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <Input
          label="Email address"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="password-field">
          <Input
            label="Password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        </div>
        <div className="auth-link-row">
          <span>Need help accessing your account?</span>
          <Link href="/contact">Contact us</Link>
        </div>
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </section>
  );
}
