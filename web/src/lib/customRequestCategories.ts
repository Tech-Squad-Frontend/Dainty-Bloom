import { PRODUCT_CATEGORIES } from './productCategories';

const DIRECT_SHOP_CATEGORY_SLUGS = new Set<string>(
  PRODUCT_CATEGORIES.map(({ slug }) => slug),
);

export function isCustomRequestOnlyCategory(slug: string): boolean {
  return !DIRECT_SHOP_CATEGORY_SLUGS.has(slug.toLowerCase());
}
