# Dainty Bloom Security Architecture

## Authentication

The Express API uses database-backed users, bcrypt password hashes, short-lived
access JWT cookies and rotating refresh JWT cookies. Staff and administrator
accounts require TOTP or recovery-code MFA before protected administrative
access. Password changes, password resets, logout, role changes and MFA changes
increment the database `tokenVersion` and invalidate older sessions.

## Authorization

Every sensitive Express route must declare authentication and role/permission
middleware. Use the existing helpers:

- `authenticate` — valid access cookie and active token version.
- `requireRole(...)` — customer/admin/staff role boundary.
- `requirePermission(...)` — fine-grained staff permission.
- `requireRecentMfa(...)` — recent MFA for sensitive staff operations.
- `requireCustomerOwnership(...)` — customer-owned resource.
- `requireGuestOwnership(...)` — guest-session-owned resource.

Customer endpoints must also perform service-level ownership checks. Middleware
is defense-in-depth; it must not be the only check.

## Route pattern

```ts
adminRoutes.post(
  '/:id/sensitive-action',
  authenticate,
  requirePermission('orders:refund'),
  requireRecentMfa(),
  validate(sensitiveActionSchema),
  sensitiveAction,
);
```

Public resource routes should use validation and explicit public DTO serializers.
Staff routes must use permissions and, for irreversible operations, recent MFA.
Customer routes must enforce `req.user._id`; guest routes must enforce
`req.guestSessionId`.

## Customer data

API responses use explicit safe-user and customer DTO representations. Default
Mongoose documents must not be returned from public endpoints. Password hashes,
reset hashes, MFA secrets, recovery codes, private storage keys and internal
security metadata are excluded by default.

Customer exports include only the requesting account. Account deletion uses a
staged grace period and retains legally or operationally required orders and
payment reconciliation records.

## Payments

Payment amount and currency are never trusted from the frontend. Stripe and
manual providers must use server-persisted order totals and
`paymentInvariants.ts`:

- Stored item totals, adjustments and order totals must reconcile.
- Stripe Checkout receives only server-derived GBP minor-unit amounts.
- Browser redirects cannot mark an order paid.
- Stripe webhooks require `constructEvent()` signature verification.
- Raw webhook bodies must reach signature verification unchanged.
- Stripe event IDs and payment reconciliation prevent duplicate fulfillment.
- Pending and failed orders cannot be treated as paid.
- Manual payments require authenticated staff authorization and audit records.

## Artwork uploads

Every upload route must use:

1. Multer memory/file limits.
2. Real file signature and MIME detection.
3. SVG or PDF validation.
4. Raster dimensions/decompression limits.
5. ClamAV/malware scan.
6. Quarantine on infected or scanner-failed uploads.
7. Private storage.
8. Owner/session or staff permission checks.

No upload is `clean` until scanner completion. Existing `legacy_unverified`
records are not implicitly promoted. Signed staff downloads expire and require
active staff permissions and matching token version.

## Environment variables

Security-sensitive variables include JWT secrets, cookie signing, MFA encryption,
field encryption and previous data keys, upload signing, database credentials,
Stripe keys/webhook secret, Cloudinary credentials, SMTP credentials and
`CLAMAV_HOST`. Production secrets belong in hosting-platform secret management,
never in `NEXT_PUBLIC_*`, source control or frontend bundles.

## Required middleware for new routes

- Mutating API routes: `csrfGuard` plus `X-Requested-With`.
- Authenticated routes: `authenticate`.
- Staff routes: `requirePermission` and, for sensitive operations,
  `requireRecentMfa`.
- Resource routes: strict Zod `validate` and ownership middleware.
- Upload routes: `singleMemoryUpload` or `messageMemoryUpload` plus the artwork
  pipeline.
- Webhooks: raw body parsing and provider signature verification, with CSRF
  explicitly exempted.

## Regression tests

Security changes require tests for both allowed and forbidden behavior. Add tests
to the relevant groups:

- Authentication and MFA.
- Authorization and ownership.
- Customer and guest isolation.
- Payment and webhook integrity.
- Upload and malware handling.
- API validation and NoSQL payload rejection.
- CSP, CSRF and browser security.
- MongoDB and infrastructure configuration.
