import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ArtworkAsset,
  Cart,
  CustomOffer,
  Message,
  Order,
  PrivacyExport,
  Subscriber,
  Wishlist,
  User,
  type IUser,
} from '../models';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import {
  decryptSensitiveField,
  encryptSensitiveField,
} from '../utils/fieldEncryption';
import { logAuditEvent } from './audit.service';
import { getStorageDriver } from './storage';
import { getArtworkStorageMeta } from './storage';
import type { IArtworkAsset } from '../models/ArtworkAsset';

export interface PrivacyExportRecord {
  id: string;
  expiresAt: Date;
  downloadUrl: string;
}

export async function createCustomerDataExport(
  user: IUser,
  ip?: string,
): Promise<PrivacyExportRecord> {
  const [orders, messages, artwork, customOffers] = await Promise.all([
    Order.find({ user: user._id }).lean(),
    Message.find({ customerId: user._id }).lean(),
    ArtworkAsset.find({ owner: user._id }).lean(),
    CustomOffer.find({ customer: user._id }).lean(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      addresses: user.addresses,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    orders: orders.map((order) => ({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.payment.status,
      paymentProvider: order.payment.provider,
      currency: order.currency,
      totals: {
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
      },
      contact: order.contactSnapshot,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      items: order.items.map((item) => ({
        title: item.titleSnapshot,
        sku: item.skuSnapshot,
        selectedOptions: item.selectedOptions,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        lineTotalMinor: item.lineTotalMinor,
      })),
      shipment: order.shipment ?? null,
      refunds: order.refunds.map((refund) => ({
        amountMinor: refund.amountMinor,
        reason: refund.reason,
        reference: refund.reference ?? null,
        at: refund.at,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    })),
    messages: messages.map((message) => ({
      subject: message.subject,
      body: message.body,
      type: message.type,
      status: message.status,
      requestDetails: message.requestDetails ?? null,
      responses: message.customRequestResponses.map((response) => ({
        status: response.status,
        message: response.message,
        createdAt: response.createdAt,
      })),
      replies: message.replies.map((reply) => ({
        body: reply.body,
        createdAt: reply.createdAt,
      })),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    })),
    artwork: artwork.map((asset) => ({
      id: asset._id.toString(),
      originalFilename: asset.originalFilename,
      detectedMimeType: asset.detectedMimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width ?? null,
      height: asset.height ?? null,
      reviewStatus: asset.reviewStatus,
      createdAt: asset.createdAt,
    })),
    customOffers: customOffers.map((offer) => ({
      status: offer.status,
      agreedPriceMinor: offer.agreedPriceMinor,
      agreedQuantity: offer.agreedQuantity,
      specifications: offer.specifications,
      expiresAt: offer.expiresAt,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    })),
  };

  const encrypted = encryptSensitiveField(JSON.stringify(payload));
  const now = new Date();
  const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`;
  const id = randomBytes(16).toString('hex');
  const downloadToken = randomBytes(32).toString('base64url');
  const storageKey = `exports/${datePath}/${id}.enc`;
  const target = path.resolve(env.STORAGE_PRIVATE_DIR, storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  const fileBuffer = Buffer.from(encrypted, 'utf8');
  await writeFile(target, fileBuffer, { flag: 'wx', mode: 0o600 });
  const expiresAt = new Date(
    now.getTime() + durationToMs(env.PRIVACY_EXPORT_TTL),
  );
  const record = await PrivacyExport.create({
    owner: user._id,
    downloadTokenHash: createHash('sha256').update(downloadToken).digest('hex'),
    storageKey,
    sizeBytes: fileBuffer.byteLength,
    expiresAt,
  });
  await logAuditEvent({
    actor: user,
    action: 'privacy.export_requested',
    targetType: 'User',
    targetId: user._id.toString(),
    metadata: { exportId: record._id.toString(), expiresAt },
    ip,
  });
  return {
    id: record._id.toString(),
    expiresAt,
    downloadUrl: `/api/privacy/data-export/${record._id.toString()}/download?token=${encodeURIComponent(downloadToken)}`,
  };
}

export async function getCustomerDataExport(
  user: IUser,
  exportId: string,
  token: string,
): Promise<{ buffer: Buffer; expiresAt: Date }> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const record = await PrivacyExport.findOne({
    _id: exportId,
    owner: user._id,
    downloadTokenHash: tokenHash,
  }).select('+storageKey +downloadTokenHash');
  if (
    !record ||
    record.status !== 'ready' ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw new AppError(
      'Export is unavailable or expired',
      404,
      'PRIVACY_EXPORT_NOT_FOUND',
    );
  }
  const target = resolveExportPath(record.storageKey);
  let buffer: Buffer;
  try {
    buffer = await readFile(target);
  } catch {
    throw new AppError(
      'Export file is unavailable',
      503,
      'PRIVACY_EXPORT_UNAVAILABLE',
    );
  }
  record.downloadedAt = new Date();
  await record.save();
  await logAuditEvent({
    actor: user,
    action: 'privacy.export_downloaded',
    targetType: 'PrivacyExport',
    targetId: record._id.toString(),
  });
  return {
    buffer: Buffer.from(decryptSensitiveField(buffer.toString('utf8'))),
    expiresAt: record.expiresAt,
  };
}

export async function requestAccountDeletion(
  user: IUser,
  password: string,
  ip?: string,
): Promise<{ scheduledAt: Date }> {
  const stored = await User.findById(user._id).select('+passwordHash');
  if (!stored) throw new AppError('Account not found', 404, 'USER_NOT_FOUND');
  const bcrypt = await import('bcryptjs');
  if (!(await bcrypt.default.compare(password, stored.passwordHash))) {
    throw new AppError(
      'Password is incorrect',
      400,
      'INVALID_CURRENT_PASSWORD',
    );
  }
  if (stored.deletionStatus === 'requested') {
    throw new AppError(
      'Account deletion is already scheduled',
      409,
      'ACCOUNT_DELETION_ALREADY_REQUESTED',
    );
  }
  const scheduledAt = new Date(
    Date.now() +
      env.ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
  stored.deletionStatus = 'requested';
  stored.deletionRequestedAt = new Date();
  stored.deletionScheduledAt = scheduledAt;
  stored.tokenVersion += 1;
  await stored.save();
  await logAuditEvent({
    actor: stored,
    action: 'privacy.account_deletion_requested',
    targetType: 'User',
    targetId: stored._id.toString(),
    ip,
  });
  return { scheduledAt };
}

export async function cancelAccountDeletion(
  user: IUser,
  ip?: string,
): Promise<void> {
  const stored = await User.findById(user._id);
  if (!stored) throw new AppError('Account not found', 404, 'USER_NOT_FOUND');
  if (stored.deletionStatus !== 'requested') return;
  stored.deletionStatus = 'none';
  stored.deletionRequestedAt = undefined;
  stored.deletionScheduledAt = undefined;
  stored.accountState = 'active';
  stored.tokenVersion += 1;
  await stored.save();
  await logAuditEvent({
    actor: stored,
    action: 'privacy.account_deletion_cancelled',
    targetType: 'User',
    targetId: stored._id.toString(),
    ip,
  });
}

export async function cancelAccountDeletionByCredentials(
  email: string,
  password: string,
  ip?: string,
): Promise<boolean> {
  const user = await User.findById(
    (
      await User.findOne({ email: email.toLowerCase() }).select(
        '_id',
      )
    )?._id,
  ).select('+passwordHash');
  if (!user) return false;
  const bcrypt = await import('bcryptjs');
  if (!(await bcrypt.default.compare(password, user.passwordHash))) return false;
  if (user.deletionStatus !== 'requested') return false;
  user.deletionStatus = 'none';
  user.deletionRequestedAt = undefined;
  user.deletionScheduledAt = undefined;
  user.accountState = 'active';
  user.tokenVersion += 1;
  await user.save();
  await logAuditEvent({
    actor: user,
    action: 'privacy.account_deletion_cancelled',
    targetType: 'User',
    targetId: user._id.toString(),
    ip,
  });
  return true;
}

export async function completeScheduledAccountDeletions(): Promise<{
  completed: number;
}> {
  const users = await User.find({
    deletionStatus: 'requested',
    deletionScheduledAt: { $lte: new Date() },
  }).select(
    '+passwordHash +emailVerificationTokenHash +passwordResetTokenHash +mfaSecretEncrypted +mfaRecoveryCodes',
  );
  let completed = 0;
  for (const user of users) {
    await Cart.deleteMany({ user: user._id });
    await Wishlist.deleteMany({ user: user._id });
    await Subscriber.deleteMany({ email: user.email });
    await CustomOffer.updateMany(
      { customer: user._id, status: { $in: ['available', 'reserved'] } },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Account deletion completed',
        },
      },
    );

    await Message.updateMany(
      { customerId: user._id },
      {
        $set: {
          customerId: undefined,
          name: 'Deleted Customer',
          email: `deleted-${user._id.toString()}@example.invalid`,
          body: '[Personal customer content removed]',
          requestDetails: undefined,
          customRequestResponses: [],
          replies: [],
        },
      },
    );

    const terminalStatuses = ['completed', 'cancelled'];
    const activeOrderIds = (
      await Order.find({
        user: user._id,
        status: { $nin: terminalStatuses },
      })
        .select('_id')
        .lean()
    ).map((order) => order._id);
    const artwork = await ArtworkAsset.find({
      owner: user._id,
    }).select('+storageKey');
    for (const asset of artwork) {
      if (
        asset.order &&
        activeOrderIds.some((id) => id.toString() === asset.order?.toString())
      ) {
        asset.owner = undefined;
        await asset.save();
        continue;
      }
      await deleteArtworkAsset(asset);
    }

    const deletedMarker = `deleted-${user._id.toString()}@example.invalid`;
    user.name = 'Deleted Customer';
    user.email = deletedMarker;
    user.phone = undefined;
    user.addresses = [];
    user.passwordHash = await randomPasswordHash();
    user.accountState = 'suspended';
    user.emailVerified = false;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    user.mfaEnabled = false;
    user.mfaSecretEncrypted = undefined;
    user.mfaRecoveryCodes = [];
    user.recentMfaExpiresAt = undefined;
    user.deletionStatus = 'completed';
    user.tokenVersion += 1;
    await user.save();
    await logAuditEvent({
      actorRole: 'system',
      action: 'privacy.account_deletion_completed',
      targetType: 'User',
      targetId: user._id.toString(),
      metadata: { financialRecordsRetained: true },
    });
    completed += 1;
  }
  return { completed };
}

export async function cleanupPrivacyRetention(): Promise<{
  expiredExports: number;
}> {
  const now = new Date();
  const expiredExports = await PrivacyExport.find({
    expiresAt: { $lte: now },
    status: 'ready',
  }).select('+storageKey');
  let removed = 0;
  for (const record of expiredExports) {
    const target = resolveExportPath(record.storageKey);
    await rm(target, { force: true });
    record.status = 'deleted';
    await record.save();
    removed += 1;
  }

  const guestCutoff = new Date(
    now.getTime() - env.GUEST_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  await Promise.all([
    Cart.deleteMany({ sessionId: { $exists: true }, updatedAt: { $lt: guestCutoff } }),
    Wishlist.deleteMany({ sessionId: { $exists: true }, updatedAt: { $lt: guestCutoff } }),
  ]);

  await User.updateMany(
    {
      passwordResetExpiresAt: { $lte: now },
    },
    {
      $unset: {
        passwordResetTokenHash: 1,
        passwordResetExpiresAt: 1,
      },
    },
  );

  return { expiredExports: removed };
}

async function deleteArtworkAsset(asset: IArtworkAsset): Promise<void> {
  if (!asset.storageKey) return;
  await getStorageDriver(asset.storageDriver).delete(
    asset.storageKey,
    getArtworkStorageMeta(asset),
  );
  await asset.deleteOne();
}

function resolveExportPath(storageKey: string): string {
  const root = path.resolve(env.STORAGE_PRIVATE_DIR);
  if (!/^exports\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{32}\.enc$/.test(storageKey)) {
    throw new AppError(
      'Invalid export storage key',
      500,
      'PRIVACY_EXPORT_UNAVAILABLE',
    );
  }
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new AppError(
      'Invalid export storage key',
      500,
      'PRIVACY_EXPORT_UNAVAILABLE',
    );
  }
  return target;
}

async function randomPasswordHash(): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.hash(randomBytes(48).toString('base64url'), env.BCRYPT_COST);
}

function durationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d|w)$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);
  const unit = match[2];
  const count = Number(match[1]);
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return count * (multipliers[unit] ?? 0);
}
