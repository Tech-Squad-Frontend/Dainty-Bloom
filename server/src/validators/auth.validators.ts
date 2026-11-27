import { z } from 'zod';

const emptyObject = z.object({}).strict();
const addressSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    line1: z.string().trim().min(1).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(32),
    country: z.string().trim().min(2).max(100),
    isDefault: z.boolean(),
  })
  .strict();

function requestSchema<T extends z.ZodType>(body: T) {
  return z.object({ body, query: emptyObject, params: emptyObject });
}

export const registerSchema = requestSchema(
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase()),
    password: z.string().min(10).max(128),
  }).strict(),
);

export const loginSchema = requestSchema(
  z.object({
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase()),
    password: z.string().min(1).max(128),
    portal: z.enum(['customer', 'admin']).default('customer'),
  }).strict(),
);

export const profileSchema = requestSchema(
  z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(40).optional(),
      addresses: z.array(addressSchema).max(30).optional(),
      email: z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((email) => email.toLowerCase())
        .optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one profile field must be provided',
    })
    .strict(),
);

export const changePasswordSchema = requestSchema(
  z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  }).strict(),
);

export const forgotPasswordSchema = requestSchema(
  z.object({
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase()),
  }).strict(),
);

export const resetPasswordSchema = requestSchema(
  z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/i),
    password: z.string().min(10).max(128),
  }).strict(),
);

export const mfaVerifySchema = requestSchema(
  z.object({
    challengeId: z.string().min(32).max(128),
    code: z.string().trim().min(6).max(20),
  }),
);

export const mfaEnrollmentStartSchema = requestSchema(
  z.object({ challengeId: z.string().min(32).max(128).optional() }),
);

export const mfaEnrollmentConfirmSchema = requestSchema(
  z.object({
    challengeId: z.string().min(32).max(128).optional(),
    code: z.string().trim().min(6).max(20),
  }),
);

export const mfaDisableSchema = requestSchema(
  z.object({ code: z.string().trim().min(6).max(20) }),
);

export const emailVerificationSchema = requestSchema(
  z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i) }),
);

export const emailVerificationRequestSchema = requestSchema(
  z.object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
  }),
);

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type ProfileInput = z.infer<typeof profileSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>['body'];
