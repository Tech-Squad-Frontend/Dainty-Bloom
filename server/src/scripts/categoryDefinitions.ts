import { Category } from '../models';
import { slugify } from '../utils/slugify';

const categories = [
  {
    name: 'Flower Coasters',
    description: 'Floral and botanical 3D-printed coaster sets.',
  },
  {
    name: 'Vases and Planters',
    description: 'Colorful 3D-printed vases, planters, and plant pots.',
  },
  {
    name: 'Lamps and Lighting',
    description: 'Decorative 3D-printed lamps and lighting designs.',
  },
  {
    name: 'Wine and Glass Racks',
    description: '3D-printed stands and racks for bottles and glassware.',
  },
  {
    name: 'Side Tables',
    description: 'Small statement tables made with 3D printing.',
  },
  {
    name: 'Pet Bowl Stands',
    description: 'Raised 3D-printed stands for pet bowls.',
  },
  {
    name: 'Seasonal Decorations',
    description: 'Playful seasonal sets and decorative display pieces.',
  },
  {
    name: 'Jewelry Boxes',
    description: 'Decorative 3D-printed storage for jewelry and keepsakes.',
  },
] as const;

/**
 * Creates the current public category set and retires old categories without
 * deleting them. Keeping legacy records preserves existing product references
 * so an administrator can reassign old products deliberately.
 */
export async function ensureBusinessCategories(
  deactivateUnused = true,
): Promise<void> {
  const activeSlugs: string[] = [];
  for (const [sortOrder, category] of categories.entries()) {
    const slug = slugify(category.name);
    activeSlugs.push(slug);
    await Category.findOneAndUpdate(
      { slug },
      {
        $set: {
          name: category.name,
          description: category.description,
          formProfile: 'three_d_printed',
          isActive: true,
          sortOrder,
        },
        $unset: { parent: '' },
        $setOnInsert: { slug },
      },
      { upsert: true, new: true, runValidators: true },
    );
  }

  if (deactivateUnused) {
    await Category.updateMany(
      { slug: { $nin: activeSlugs } },
      { $set: { isActive: false } },
    );
  }
}
