import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { getPublicSettings } from '@/lib/api/server';

export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  const settingsResult = await getPublicSettings();
  const settings = settingsResult.data;

  return (
    <>
      <Header settings={settings} />
      <main
        id="main-content"
        className="main-content"
        data-route-focus
        tabIndex={-1}
      >
        {children}
      </main>
      <Footer settings={settings} />
    </>
  );
}
