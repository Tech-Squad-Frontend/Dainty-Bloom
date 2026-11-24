import type { Metadata } from 'next';
import Link from 'next/link';
import { CustomProductRequestForm } from '@/components/contact/Custom3DRequestForm';
import { getPublicSettings } from '@/lib/api/server';
import { getCanonicalUrl } from '@/lib/siteUrl';

const description =
  'Request a custom 3D print, T-shirt, mug, tote bag, phone case, or canvas. Share your idea and Dainty Bloom will review the design, feasibility, and quote with you.';
const canonical = getCanonicalUrl('/custom-3d-request');
export const metadata: Metadata = {
  title: 'Custom Print and Canvas Requests',
  description,
  ...(canonical ? { alternates: { canonical } } : {}),
  openGraph: {
    title: 'Custom Print and Canvas Requests | Dainty Bloom',
    description,
    type: 'website',
    ...(canonical ? { url: canonical } : {}),
  },
  twitter: {
    card: 'summary',
    title: 'Custom Print and Canvas Requests | Dainty Bloom',
    description,
  },
};

export default async function Custom3DRequestPage() {
  const settingsResult = await getPublicSettings();
  const maxUploadBytes = settingsResult.data?.artwork.maxBytes ?? null;

  return (
    <div className="commerce-page custom-3d-page">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Custom print request</span>
      </nav>

      <header className="custom-3d-page__heading">
        <span className="eyebrow">Made to request</span>
        <h1>Let’s make your idea</h1>
        <p>
          Request a 3D print, a printed T-shirt, mug, tote bag or phone case, or
          one of two canvas styles: paint-it-yourself or dimensional textured
          artwork made with filament mesh. These are custom-only items. Share
          your idea or artwork and a theme such as Autumn, Halloween, Christmas,
          or Anime. We&apos;ll review what is possible and send you the details
          and a quote before production.
        </p>
        <ol className="custom-3d-page__steps" aria-label="How custom requests work">
          <li><span>01</span> Tell us what you have in mind</li>
          <li><span>02</span> We review and prepare a quote</li>
          <li><span>03</span> You approve before we make it</li>
        </ol>
      </header>

      <CustomProductRequestForm maxUploadBytes={maxUploadBytes} />

      <nav className="custom-3d-page__links" aria-label="More options">
        <Link className="text-link" href="/shop">
          Browse the shop
        </Link>
        <Link className="text-link" href="/contact">
          General enquiries
        </Link>
      </nav>
    </div>
  );
}
