import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/Brand';

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="auth-page" data-route-focus tabIndex={-1}>
      <section className="auth-card" aria-label="Dainty Bloom account">
        <aside className="auth-brand-panel">
          <Brand />
          <p>
            Retro-inspired home décor, custom accents, and joyful 3D prints.
          </p>
        </aside>
        <div className="auth-form-panel">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
