import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CatalogBrowse } from '@/components/catalog/CatalogBrowse';
import { ErrorStateCatalog } from '@/components/catalog/CatalogComponents';
import { CollectionHero } from '@/components/catalog/CollectionHero';
import { CustomProductRequestForm } from '@/components/contact/Custom3DRequestForm';
import {
  getPublicCatalog,
  getPublicCategories,
  getPublicCategory,
  getPublicSettings,
} from '@/lib/api/server';
import { getAbsoluteUrl, getConfiguredSiteUrl } from '@/lib/siteUrl';
import { isCustomRequestOnlyCategory } from '@/lib/customRequestCategories';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicCategory(slug);
  if (!result.data) {
    return {
      title: 'Category unavailable',
      robots: { index: false, follow: false },
    };
  }
  const siteUrl = getConfiguredSiteUrl();
  if (isCustomRequestOnlyCategory(result.data.slug)) {
    const customDescription = `Request a custom ${result.data.name.toLowerCase()} from Dainty Bloom. Share your idea and receive a quote before payment.`;
    return {
      title: `${result.data.name} custom request`,
      description: customDescription,
      robots: { index: false, follow: true },
    };
  }
  const description =
    result.data.description ||
    `Browse ${result.data.name} in the Dainty Bloom shop and explore the available products.`;
  const canonical = getAbsoluteUrl(
    result.data.slug
      ? `/category/${encodeURIComponent(result.data.slug)}`
      : `/category/${encodeURIComponent(slug)}`,
    siteUrl,
  );
  return {
    title: result.data.name,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      title: result.data.name,
      description,
      type: 'website',
      ...(canonical ? { url: canonical } : {}),
    },
    twitter: { card: 'summary', title: result.data.name, description },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const initialQuery: Record<string, string> = {};
  for (const key of [
    'q',
    'productType',
    'printTechnique',
    'minPrice',
    'maxPrice',
    'color',
    'size',
    'inStock',
    'sort',
    'page',
  ]) {
    const value = raw[key];
    if (typeof value === 'string' && value) initialQuery[key] = value;
  }
  const catalogQuery = { ...initialQuery, category: slug };
  const queryString = new URLSearchParams(catalogQuery).toString();
  const categoryResult = await getPublicCategory(slug);
  if (!categoryResult.data && categoryResult.status === 404) notFound();
  if (!categoryResult.data)
    return (
      <div className="container catalog-error-page">
        <ErrorStateCatalog title="This category could not be loaded" />
      </div>
    );
  if (isCustomRequestOnlyCategory(categoryResult.data.slug)) {
    const settingsResult = await getPublicSettings();
    return (
      <div className="commerce-page custom-3d-page">
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/shop">Shop</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{categoryResult.data.name}</span>
        </nav>
        <header className="custom-3d-page__heading">
          <span className="eyebrow">Made to order by request</span>
          <h1>{categoryResult.data.name} custom request</h1>
          <p>
            This item is available as a custom request. Tell us what you have
            in mind and our team will review the details, prepare a custom
            listing, and send you a quote before you pay.
          </p>
        </header>
        <CustomProductRequestForm
          maxUploadBytes={settingsResult.data?.artwork.maxBytes ?? null}
          defaultRequestTitle={`${categoryResult.data.name} custom request`}
          defaultProductType="Other personalised or custom product"
        />
      </div>
    );
  }
  const [catalogResult, categoriesResult] = await Promise.all([
    getPublicCatalog(`?${queryString}`),
    getPublicCategories(),
  ]);
  return (
    <CatalogBrowse
      initialData={catalogResult.data}
      category={categoryResult.data}
      categories={categoriesResult.data ?? []}
      initialQuery={initialQuery}
      customBanner={
        <>
          {categoryResult.data.slug === 'lamps-and-lighting' ? (
            <CollectionHero
              imageSrc="/images/Lamp%20%26%20Lighting.png"
              imageAlt="A lamp from the Dainty Bloom lighting collection"
              title="How our lamps come together"
              description="Each lamp begins with 3D-printed components, then is assembled with its lamp parts and cables."
            />
          ) : null}
          {slug.toLowerCase().includes('3d') ? (
            <section className="custom-request-banner custom-request-banner--category">
              <div>
                <h2>Have a custom product in mind?</h2>
                <p>
                  Tell us what you&apos;d love us to make. We&apos;ll review
                  your idea and get back to you about a quote.
                </p>
              </div>
              <Link
                className="button button--primary"
                href="/custom-3d-request"
              >
                Request a custom product
              </Link>
            </section>
          ) : null}
        </>
      }
    />
  );
}
