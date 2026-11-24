import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Palette } from 'lucide-react';
import { Suspense } from 'react';
import { AboutMediaGallery } from '@/components/about/AboutMediaGallery';
import { getPublicAboutMedia } from '@/lib/api/server';
import { getCanonicalUrl } from '@/lib/siteUrl';
import { PRODUCT_CATEGORIES } from '@/lib/productCategories';
import { ProductLineIcon } from '@/components/catalog/CatalogComponents';

const description =
  'Meet Dainty Bloom: retro-inspired home décor, plants and planters, custom-printed home accents, and playful 3D prints.';
const canonical = getCanonicalUrl('/about');
export const metadata: Metadata = {
  title: 'About',
  description,
  ...(canonical ? { alternates: { canonical } } : {}),
  openGraph: {
    title: 'About Dainty Bloom',
    description,
    type: 'website',
    ...(canonical ? { url: canonical } : {}),
  },
  twitter: { card: 'summary', title: 'About Dainty Bloom', description },
};

export default async function AboutPage() {
  const mediaResultPromise = getPublicAboutMedia();

  return (
    <div className="commerce-page about-page">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">About us</span>
      </nav>

      <section className="about-hero" aria-labelledby="about-title">
        <div className="about-hero__copy">
          <span className="eyebrow">A little about Dainty Bloom</span>
          <h1 id="about-title">Where Home Comes to Bloom</h1>
          <p>
            We bring retro dopamine décor together with plants and planters,
            custom-printed home accents, and playful 3D prints. Explore the
            collections or tell us about a custom piece you have in mind.
          </p>
          <div className="button-row">
            <Link className="button button--primary button--lg" href="/shop">
              Explore the shop
            </Link>
            <Link
              className="button button--secondary button--lg"
              href="/custom-3d-request"
            >
              Request a custom 3D print
            </Link>
          </div>
        </div>
        <div className="about-hero__visual">
          <span
            className="about-hero__shape about-hero__shape--mint"
            aria-hidden="true"
          />
          <span
            className="about-hero__shape about-hero__shape--peach"
            aria-hidden="true"
          />
          <div className="about-hero__art">
            <Image
              src="/images/new-logo.png"
              alt="Dainty Bloom orange and blue floral monogram"
              width={640}
              height={426}
              sizes="(max-width: 600px) 72vw, (max-width: 900px) 40vw, 352px"
              loading="eager"
            />
          </div>
          <span className="about-hero__caption">
            Where Home Comes to Bloom
          </span>
        </div>
      </section>

      <section className="about-story" aria-labelledby="about-story-title">
        <div className="about-story__icon" aria-hidden="true">
          <Palette size={25} />
        </div>
        <div>
          <span className="eyebrow">Our approach</span>
          <h2 id="about-story-title">Playful pieces with personality</h2>
          <p>
            Dainty Bloom is a home and lifestyle brand for people who love color,
            character, and a little retro dopamine. From plants and planters to
            custom-printed cushions and 3D-printed décor, each collection is
            chosen to make everyday spaces feel more personal.
          </p>
        </div>
      </section>

      <Suspense fallback={<AboutMediaLoading />}>
        <AboutMediaGallery resultPromise={mediaResultPromise} />
      </Suspense>

      <section
        className="about-offerings"
        aria-labelledby="about-offerings-title"
      >
        <header className="about-section-heading">
          <span className="eyebrow">Explore the collections</span>
          <h2 id="about-offerings-title">3D-printed home décor</h2>
          <p>
            Our main collection includes printed pieces for homes, plants, pets,
            and thoughtful gifts.
          </p>
        </header>
        <ul className="about-offerings__grid">
          {PRODUCT_CATEGORIES.map(({ name, slug }) => (
            <li className="about-offering-card" key={slug}>
              <span className="about-offering-card__icon" aria-hidden="true"><ProductLineIcon value={name} /></span>
              <h3>{name}</h3>
              <p>Designed as a colorful, made-to-order 3D-printed home piece.</p>
              <Link className="text-link" href={`/category/${slug}`}>Explore collection <ArrowRight size={16} aria-hidden="true" /></Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="about-experience"
        aria-labelledby="about-experience-title"
      >
        <div>
          <span className="eyebrow">Your creative journey</span>
          <h2 id="about-experience-title">
            Custom prints beyond the 3D collection
          </h2>
          <p>
            Alongside our ready-to-order 3D-printed home pieces, we take custom
            requests for printed T-shirts, mugs, tote bags, phone cases, and
            canvases. Choose a paint-it-yourself canvas with a design to colour,
            or ask about our dimensional canvas artwork built from layered
            filament mesh. These items are made to request, so share your idea
            or artwork and we will check the design and what is possible before
            sending a quote. We only begin after you have reviewed the details.
          </p>
          <p>
            Requests can follow seasonal and pop-culture themes such as Autumn,
            Halloween, Christmas, and Anime, or a theme of your own. Final
            details, availability, and price are confirmed with you first.
          </p>
          <ul className="about-experience__items" aria-label="Custom print options">
            {[
              'T-shirt prints',
              'Mugs',
              'Tote bags',
              'Phone cases',
              'Paint-it-yourself canvases',
              'Textured filament-mesh canvases',
            ].map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <Link className="button button--primary" href="/custom-3d-request">
          Send a custom request <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className="about-cta" aria-labelledby="about-cta-title">
        <div>
          <span className="eyebrow">Ready to explore?</span>
          <h2 id="about-cta-title">Find a piece or start with an idea</h2>
          <p>
            Browse the current shop or tell us about a custom product you have
            in mind.
          </p>
        </div>
        <div className="button-row">
          <Link className="button button--primary" href="/shop">
            Visit the shop
          </Link>
          <Link className="button button--secondary" href="/custom-3d-request">
            Custom product request
          </Link>
        </div>
      </section>
    </div>
  );
}

function AboutMediaLoading() {
  return (
    <section
      className="about-media about-media--loading"
      aria-labelledby="about-media-loading-title"
      role="status"
    >
      <header className="about-section-heading">
        <span className="eyebrow">Inside Dainty Bloom</span>
        <h2 id="about-media-loading-title">Loading the creative collection…</h2>
      </header>
      <div className="about-media__loading-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
