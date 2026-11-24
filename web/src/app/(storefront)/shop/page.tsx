import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CatalogBrowse } from '@/components/catalog/CatalogBrowse';
import { getPublicCatalog, getPublicCategories } from '@/lib/api/server';
import { getCanonicalUrl } from '@/lib/siteUrl';
import { isCustomRequestOnlyCategory } from '@/lib/customRequestCategories';

export const revalidate = 60;
const description =
  'Shop Dainty Bloom’s 3D-printed home décor, planters, lighting, and playful made-to-order designs.';
const canonical = getCanonicalUrl('/shop');
export const metadata: Metadata = {
  title: 'Shop',
  description,
  ...(canonical ? { alternates: { canonical } } : {}),
  openGraph: {
    title: 'Shop Dainty Bloom',
    description,
    type: 'website',
    ...(canonical ? { url: canonical } : {}),
  },
  twitter: { card: 'summary', title: 'Shop Dainty Bloom', description },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = [
  'q',
  'category',
  'productType',
  'printTechnique',
  'minPrice',
  'maxPrice',
  'color',
  'size',
  'inStock',
  'sort',
  'page',
] as const;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const initialQuery: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value) initialQuery[key] = value;
  }
  if (
    initialQuery.category &&
    isCustomRequestOnlyCategory(initialQuery.category)
  ) {
    redirect(`/category/${encodeURIComponent(initialQuery.category)}`);
  }
  const queryString = new URLSearchParams(initialQuery).toString();
  const [catalogResult, categoriesResult] = await Promise.all([
    getPublicCatalog(queryString ? `?${queryString}` : ''),
    getPublicCategories(),
  ]);
  return (
    <CatalogBrowse
      initialData={catalogResult.data}
      categories={categoriesResult.data ?? []}
      initialQuery={initialQuery}
    />
  );
}
