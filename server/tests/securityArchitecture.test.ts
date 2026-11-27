import { describe, expect, it } from 'vitest';

import { app } from '../src/app';
import type { IOrder } from '../src/models/Order';
import {
  assertPaymentEventAmount,
  assertPersistedOrderTotal,
  assertPaymentStatusPayable,
} from '../src/services/payment/paymentInvariants';
import { requireCustomerOwnership, requireGuestOwnership } from '../src/middleware/ownership';
import { singleMemoryUpload } from '../src/middleware/memoryUpload';
import { toSafeUser } from '../src/services/auth.service';

interface RouteProtection {
  kind: string;
  value?: string;
}

interface HandlerLike {
  routeProtection?: RouteProtection;
  stack?: LayerLike[];
}

interface LayerLike {
  handle?: HandlerLike;
  name?: string;
  regexp?: RegExp;
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
    stack: Array<{ handle: HandlerLike }>;
  };
  stack?: LayerLike[];
}

describe('Security architecture invariants', () => {
  it('protects every live admin route with authentication and permissions', () => {
    const routes = collectRoutes();
    const adminRoutes = routes.filter((route) =>
      route.path.startsWith('/api/admin'),
    );
    expect(adminRoutes.length).toBeGreaterThan(0);
    for (const route of adminRoutes) {
      expect(route.protections.some(({ kind }) => kind === 'auth')).toBe(true);
      expect(
        route.protections.some(
          ({ kind }) => kind === 'permission' || kind === 'role',
        ),
      ).toBe(true);
    }
  });

  it('keeps mutating API routes behind the global CSRF guard', () => {
    const application = app as unknown as { _router?: { stack: LayerLike[] } };
    const stack = application._router?.stack ?? [];
    const csrfLayer = stack.find(
      (layer) => layer.handle?.name === 'csrfGuard',
    );
    expect(csrfLayer).toBeTruthy();
  });

  it('provides reusable customer and guest ownership middleware', () => {
    expect(
      (
        requireCustomerOwnership(async () => 'customer-id') as HandlerLike
      ).routeProtection,
    ).toMatchObject({ kind: 'ownership', value: 'customer' });
    expect(
      (
        requireGuestOwnership(async () => 'guest-session') as HandlerLike
      ).routeProtection,
    ).toMatchObject({ kind: 'ownership', value: 'guest' });
  });

  it('marks multipart uploads through the approved middleware metadata', () => {
    const middleware = singleMemoryUpload(
      'file',
      async () => 10_485_760,
    ) as HandlerLike;
    expect(middleware.routeProtection).toMatchObject({
      kind: 'upload',
      value: 'multipart-memory',
    });
  });

  it('gates only scanner-dependent upload routes and preserves existing staff permissions', () => {
    const routes = collectRoutes();
    const scannerGuardedRoutes = routes.filter(
      (route) =>
        route.method === 'POST' &&
        route.protections.some(({ kind }) => kind === 'malware-scanning'),
    );
    expect(scannerGuardedRoutes).toHaveLength(2);

    const unaffectedAdminUploads = routes.filter(
      (route) =>
        route.method === 'POST' &&
        ((route.path.toLowerCase().includes('product') &&
          route.path.includes('/media')) ||
          (route.path.toLowerCase().includes('about') &&
            route.path.includes('media'))),
    );
    expect(unaffectedAdminUploads.length).toBeGreaterThan(0);
    for (const route of unaffectedAdminUploads) {
      expect(
        route.protections.some(({ kind }) => kind === 'malware-scanning'),
      ).toBe(false);
      expect(route.protections.some(({ kind }) => kind === 'auth')).toBe(true);
      expect(
        route.protections.some(
          ({ kind }) => kind === 'permission' || kind === 'role',
        ),
      ).toBe(true);
    }
  });

  it('enforces stored payment totals, currency, amount and payable status', () => {
    const order = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      totalMinor: 1500,
      discountMinor: 100,
      shippingMinor: 200,
      taxMinor: 400,
      currency: 'GBP',
      status: 'pending_payment',
      items: [
        {
          unitPriceMinor: 1000,
          quantity: 1,
        },
      ],
      payment: { status: 'pending' },
    } as unknown as IOrder;

    expect(() => assertPersistedOrderTotal(order)).not.toThrow();
    expect(() => assertPaymentEventAmount(order, 1500, 'gbp')).not.toThrow();
    expect(() => assertPaymentStatusPayable(order)).not.toThrow();
    expect(() => assertPaymentEventAmount(order, 1499, 'GBP')).toThrow();
    expect(() => assertPaymentEventAmount(order, 1500, 'USD')).toThrow();

    order.status = 'completed';
    expect(() => assertPaymentStatusPayable(order)).toThrow();
  });

  it('does not expose password or security fields through SafeUser serialization', () => {
    const user = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      name: 'Customer',
      email: 'customer@example.test',
      role: 'customer',
      accountState: 'active',
      addresses: [],
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordHash: 'secret-password-hash',
      passwordResetTokenHash: 'secret-reset-hash',
      mfaSecretEncrypted: 'secret-mfa-data',
    } as unknown as Parameters<typeof toSafeUser>[0];

    const serialized = JSON.stringify(toSafeUser(user));
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('passwordResetTokenHash');
    expect(serialized).not.toContain('mfaSecretEncrypted');
  });
});

function collectRoutes(): Array<{
  method: string;
  path: string;
  protections: RouteProtection[];
}> {
  const application = app as unknown as { _router?: { stack: LayerLike[] } };
  const collected: Array<{
    method: string;
    path: string;
    protections: RouteProtection[];
  }> = [];
  walk(application._router?.stack ?? [], '', [], collected);
  return collected;
}

function walk(
  stack: LayerLike[],
  prefix: string,
  inherited: RouteProtection[],
  collected: Array<{ method: string; path: string; protections: RouteProtection[] }>,
): void {
  let active = [...inherited];
  for (const layer of stack) {
    if (layer.route) {
      const protections = [
        ...active,
        ...layer.route.stack.flatMap(({ handle }) =>
          handle.routeProtection ? [handle.routeProtection] : [],
        ),
      ];
      const pathValues = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      for (const pathValue of pathValues) {
        const path = joinPath(prefix, pathValue);
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled) {
            collected.push({
              method: method.toUpperCase(),
              path,
              protections,
            });
          }
        }
      }
      continue;
    }
    if (layer.handle?.stack) {
      walk(layer.handle.stack, joinPath(prefix, fixedMountPath(layer.regexp)), active, collected);
      continue;
    }
    if (layer.handle?.routeProtection) {
      active = [...active, layer.handle.routeProtection];
    }
  }
}

function fixedMountPath(regexp: RegExp | undefined): string {
  if (!regexp) return '';
  return regexp.source
    .replace(/\\\//g, '/')
    .replace(/^\^/, '')
    .replace(/\/?\(\?=\/\|\$\).*$/, '')
    .replace(/\/?\$$/, '')
    .replace(/\/$/, '');
}

function joinPath(prefix: string, routePath: string): string {
  return `${prefix}/${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '');
}
