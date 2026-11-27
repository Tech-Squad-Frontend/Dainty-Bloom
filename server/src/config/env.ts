import { z } from 'zod';
import { loadEnvironment } from './loadEnvironment';
import { validateStripeEnvironment } from './stripeEnvValidation';
import { validateMongoConnection } from './mongoConnection';

loadEnvironment();

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL'),
    API_PUBLIC_URL: z.string().url('API_PUBLIC_URL must be a valid URL'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(/^\d+[smhdw]$/)
      .default('15m'),
    REFRESH_TOKEN_TTL: z
      .string()
      .regex(/^\d+[smhdw]$/)
      .default('7d'),
    COOKIE_SECRET: z
      .string()
      .min(32, 'COOKIE_SECRET must be at least 32 characters'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
    TRUST_PROXY: z
      .preprocess(
        (value: unknown) => {
          if (value === 'true') return true;
          if (value === 'false' || value === '') return false;
          if (typeof value === 'string' && /^\d+$/.test(value))
            return Number(value);
          return value;
        },
        z.union([
          z.literal(false),
          z.number().int().nonnegative(),
          z
            .string()
            .trim()
            .min(1)
            .refine(
              (value) =>
                value !== '*' &&
                value !== 'true' &&
                !value.includes('*'),
              'TRUST_PROXY must be false, a hop count, or explicit trusted proxy addresses',
            ),
        ]),
      )
      .default(false),
    BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
    PASSWORD_RESET_TTL: z
      .string()
      .regex(/^\d+[smhdw]$/)
      .default('15m'),
    EMAIL_VERIFICATION_TTL: z
      .string()
      .regex(/^\d+[smhdw]$/)
      .default('24h'),
    DATA_ENCRYPTION_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .optional(),
    ),
    DATA_ENCRYPTION_PREVIOUS_KEYS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((key) => key.trim())
              .filter((key) => /^[a-f0-9]{64}$/i.test(key))
          : [],
      ),
    PRIVACY_EXPORT_TTL: z
      .string()
      .regex(/^\d+[smhdw]$/)
      .default('15m'),
    ACCOUNT_DELETION_GRACE_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    PASSWORD_RESET_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    GUEST_SESSION_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    UNATTACHED_ARTWORK_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(1),
    AUDIT_LOG_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3650)
      .default(365),
    MFA_ENCRYPTION_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(
          /^[a-f0-9]{64}$/i,
          'MFA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters',
        )
        .optional(),
    ),
    MFA_CHALLENGE_TTL: z
      .string()
      .regex(/^\d+[smhdw]$/)
      .default('10m'),
    CART_MAX_QUANTITY: z.coerce.number().int().positive().max(1000).default(99),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
    STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
    STORAGE_PRIVATE_DIR: z.string().min(1).default('./storage/private'),
    UPLOAD_SIGNING_SECRET: z
      .string()
      .min(32, 'UPLOAD_SIGNING_SECRET must be at least 32 characters'),
    CLAMAV_HOST: z
      .string()
      .trim()
      .min(1)
      .optional(),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    CLAMAV_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(30_000),
    MAX_CONCURRENT_ARTWORK_UPLOADS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),
    ARTWORK_PROCESSING_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(30_000),
    ARTWORK_MAX_PIXELS: z.coerce
      .number()
      .int()
      .min(1_000_000)
      .max(100_000_000)
      .default(40_000_000),
    PRODUCT_IMAGE_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10_485_760)
      .default(10_485_760),
    PAYMENT_PROVIDER: z.enum(['manual', 'stripe']).default('manual'),
    ALLOW_LIVE_STRIPE_IN_DEVELOPMENT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    STRIPE_SECRET_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    STRIPE_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    STRIPE_PUBLISHABLE_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    STRIPE_CHECKOUT_EXPIRY_MINUTES: z.coerce
      .number()
      .int()
      .min(30)
      .max(1440)
      .default(30),
    UNPAID_ORDER_EXPIRY_HOURS: z.coerce.number().int().positive().default(48),
    CLOUDINARY_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .url()
        .refine((value) => value.toLowerCase().startsWith('cloudinary://'))
        .optional(),
    ),
    CLOUDINARY_CLOUD_NAME: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    CLOUDINARY_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    CLOUDINARY_API_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    DEFAULT_CURRENCY: z.literal('GBP').default('GBP'),
    SEED_ADMIN_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional(),
    ),
    SEED_ADMIN_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(12).optional(),
    ),
    CONTACT_RECIPIENT_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().email().optional(),
    ),
    SMTP_HOST: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    SMTP_PORT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().int().min(1).max(65535).optional(),
    ),
    SMTP_SECURE: z.preprocess((value) => {
      if (value === '') return undefined;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }, z.boolean().optional()),
    SMTP_USERNAME: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SMTP_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SMTP_FROM: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().email().optional(),
    ),
  })
  .superRefine((configuration, context) => {
    if (configuration.NODE_ENV === 'production') {
      for (const [path, value] of [
        ['CLIENT_URL', configuration.CLIENT_URL],
        ['API_PUBLIC_URL', configuration.API_PUBLIC_URL],
      ] as const) {
        try {
          const url = new URL(value);
          const loopback =
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname === '[::1]';
          if (url.protocol !== 'https:' && !loopback) {
            context.addIssue({
              code: 'custom',
              path: [path],
              message: `${path} must use HTTPS in production`,
            });
          }
        } catch {
          context.addIssue({
            code: 'custom',
            path: [path],
            message: `${path} must be a valid absolute URL`,
          });
        }
      }
    }
    try {
      validateMongoConnection(
        configuration.MONGODB_URI,
        configuration.NODE_ENV,
      );
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message:
          error instanceof Error
            ? error.message
            : 'MONGODB_URI is invalid',
      });
    }
    if (
      configuration.NODE_ENV === 'production' &&
      !configuration.CLAMAV_HOST
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CLAMAV_HOST'],
        message: 'CLAMAV_HOST is required in production',
      });
    }
    if (
      configuration.NODE_ENV === 'production' &&
      !configuration.DATA_ENCRYPTION_KEY
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DATA_ENCRYPTION_KEY'],
        message: 'DATA_ENCRYPTION_KEY is required in production',
      });
    }
    if (configuration.NODE_ENV === 'production' && !configuration.MFA_ENCRYPTION_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['MFA_ENCRYPTION_KEY'],
        message: 'MFA_ENCRYPTION_KEY is required in production',
      });
    }
    const cloudinaryConfigured =
      Boolean(configuration.CLOUDINARY_URL) ||
      Boolean(
        configuration.CLOUDINARY_CLOUD_NAME &&
        configuration.CLOUDINARY_API_KEY &&
        configuration.CLOUDINARY_API_SECRET,
      );
    if (
      configuration.STORAGE_DRIVER === 'cloudinary' &&
      !cloudinaryConfigured
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message:
          'Cloudinary credentials are required when STORAGE_DRIVER=cloudinary',
      });
    }

    const smtpPartiallyConfigured = Boolean(
      configuration.SMTP_HOST ||
      configuration.SMTP_PORT ||
      configuration.SMTP_SECURE !== undefined ||
      configuration.SMTP_USERNAME ||
      configuration.SMTP_PASSWORD ||
      configuration.SMTP_FROM,
    );

    if (
      smtpPartiallyConfigured &&
      (!configuration.SMTP_HOST ||
        !configuration.SMTP_FROM ||
        !configuration.CONTACT_RECIPIENT_EMAIL)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message:
          'SMTP_HOST, SMTP_FROM, and CONTACT_RECIPIENT_EMAIL are required together to enable contact email delivery',
      });
    }

    if (
      Boolean(configuration.SMTP_USERNAME) !==
      Boolean(configuration.SMTP_PASSWORD)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USERNAME'],
        message: 'SMTP_USERNAME and SMTP_PASSWORD must be configured together',
      });
    }

    if (
      configuration.SMTP_HOST?.toLowerCase() === 'smtp.gmail.com' &&
      (!configuration.SMTP_USERNAME || !configuration.SMTP_PASSWORD)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USERNAME'],
        message:
          'SMTP_USERNAME and SMTP_PASSWORD are required when using Gmail SMTP',
      });
    }

    if (
      configuration.SMTP_HOST?.toLowerCase() === 'smtp.gmail.com' &&
      configuration.SMTP_FROM?.toLowerCase() !== 'info@daintybloome.com'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_FROM'],
        message:
          'SMTP_FROM must be info@daintybloome.com when using Gmail SMTP',
      });
    }

    if (configuration.SMTP_HOST?.toLowerCase() === 'smtp.gmail.com') {
      const port = configuration.SMTP_PORT ?? 587;
      const secure = configuration.SMTP_SECURE ?? port === 465;
      if (!((port === 587 && !secure) || (port === 465 && secure))) {
        context.addIssue({
          code: 'custom',
          path: ['SMTP_PORT'],
          message:
            'Gmail SMTP must use port 587 with STARTTLS or port 465 with implicit TLS',
        });
      }
    }

    for (const issue of validateStripeEnvironment({
      paymentProvider: configuration.PAYMENT_PROVIDER,
      nodeEnv: configuration.NODE_ENV,
      allowLiveModeInDevelopment:
        configuration.ALLOW_LIVE_STRIPE_IN_DEVELOPMENT,
      requireStripeProvider: configuration.NODE_ENV === 'production',
      secretKey: configuration.STRIPE_SECRET_KEY,
      publishableKey: configuration.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: configuration.STRIPE_WEBHOOK_SECRET,
    })) {
      context.addIssue({
        code: 'custom',
        path: [issue.path],
        message: issue.message,
      });
    }
  });

const envResult = envSchema.safeParse(process.env);

if (envResult.success) {
  const hasCloudinaryUrl = Boolean(envResult.data.CLOUDINARY_URL);
  const cloudinaryValues = [
    envResult.data.CLOUDINARY_CLOUD_NAME,
    envResult.data.CLOUDINARY_API_KEY,
    envResult.data.CLOUDINARY_API_SECRET,
  ];
  if (
    !hasCloudinaryUrl &&
    cloudinaryValues.some(Boolean) &&
    cloudinaryValues.some((value) => !value)
  ) {
    console.error(
      'Invalid environment configuration:\n- Configure CLOUDINARY_URL or all three CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET values.',
    );
    process.exit(1);
  }
}

if (!envResult.success) {
  console.error('Invalid environment configuration:');
  for (const issue of envResult.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = envResult.data;
