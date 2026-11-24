import { disconnectDatabase, connectDatabase } from '../config/db';
import { env } from '../config/env';
import { SiteSettings } from '../models';
import { logger } from '../utils/logger';

const profile = {
  storeName: 'Dainty Bloom',
  currency: 'GBP',
  country: 'GB',
  contactEmail: 'info@daintybloome.com',
  contactPhone: '+44 7417 575436',
  whatsappNumber: '+44 7417 575436',
  socialLinks: {
    instagram: 'https://www.instagram.com/davril_forme',
    tiktok: 'https://www.tiktok.com/@atelier_davril',
    whatsapp: 'https://wa.me/447417575436',
  },
  openingHours: [
    {
      days: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ],
      open: '08:00',
      close: '19:00',
      timezone: 'Europe/London',
    },
  ],
  openingHoursDisplayText: 'Mon-Sat, 8:00am - 7:00pm',
  studioAddress: {
    label: 'Custom printing studio',
    city: 'Coventry',
    country: 'United Kingdom',
  },
  aboutNote:
    'UK-based custom 3D-printing studio in Coventry, creating flower coasters, vases and planters, lamps, wine and glass racks, side tables, pet bowl stands, seasonal decorations, and jewelry boxes. Other personalized ideas are available by custom request.',
  productLines: [
    {
      key: 'flower-coasters',
      label: 'Flower Coasters',
      description: 'Floral and botanical coaster sets made with 3D printing.',
      isActive: true,
    },
    {
      key: 'vases-and-planters',
      label: 'Vases and Planters',
      description: 'Colorful 3D-printed vases, planters, and plant pots.',
      isActive: true,
    },
    {
      key: 'lamps-and-lighting',
      label: 'Lamps and Lighting',
      description: 'Decorative 3D-printed lamps and lighting designs.',
      isActive: true,
    },
    {
      key: 'wine-and-glass-racks',
      label: 'Wine and Glass Racks',
      description: '3D-printed stands and racks for bottles and glassware.',
      isActive: true,
    },
    {
      key: 'side-tables',
      label: 'Side Tables',
      description: 'Small statement tables made with 3D printing.',
      isActive: true,
    },
    {
      key: 'pet-bowl-stands',
      label: 'Pet Bowl Stands',
      description: 'Raised 3D-printed stands for pet bowls.',
      isActive: true,
    },
    {
      key: 'seasonal-decorations',
      label: 'Seasonal Decorations',
      description: 'Playful seasonal sets and decorative display pieces.',
      isActive: true,
    },
    {
      key: 'jewelry-boxes',
      label: 'Jewelry Boxes',
      description: 'Decorative 3D-printed storage for jewelry and keepsakes.',
      isActive: true,
    },
  ],
};

async function run(): Promise<void> {
  if (env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error(
      'Refusing to apply the business profile in production without --force',
    );
  }
  await connectDatabase();
  try {
    const settings =
      (await SiteSettings.findOne({ key: 'default' })) ??
      new SiteSettings({ key: 'default' });
    const fields: Array<keyof typeof profile> = [
      'storeName',
      'currency',
      'country',
      'contactEmail',
      'contactPhone',
      'whatsappNumber',
      'openingHours',
      'openingHoursDisplayText',
      'studioAddress',
      'aboutNote',
      'productLines',
    ];
    for (const field of fields) {
      const current = settings.get(field);
      if (isEmpty(current)) settings.set(field, profile[field]);
    }
    for (const [key, value] of Object.entries(profile.socialLinks)) {
      if (!settings.socialLinks?.[key as keyof typeof profile.socialLinks]) {
        settings.set(`socialLinks.${key}`, value);
      }
    }
    if (!settings.contact.email)
      settings.set('contact.email', profile.contactEmail);
    if (!settings.contact.phone)
      settings.set('contact.phone', profile.contactPhone);
    if (!settings.contact.address) {
      settings.set(
        'contact.address',
        `${profile.studioAddress.label}, ${profile.studioAddress.city}, ${profile.studioAddress.country}`,
      );
    }
    if (settings.contact.openingHours.length === 0) {
      settings.set('contact.openingHours', [profile.openingHoursDisplayText]);
    }
    await settings.save();
    logger.info('Business profile applied to empty settings fields');
  } finally {
    await disconnectDatabase();
  }
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return Array.isArray(value) && value.length === 0;
}

void run().catch((error: unknown) => {
  logger.error({ err: error }, 'Business profile update failed');
  process.exitCode = 1;
});
