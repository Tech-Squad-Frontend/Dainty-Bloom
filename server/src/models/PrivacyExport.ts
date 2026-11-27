import { Schema, Types, model, models, type Document, type Model } from 'mongoose';

export interface IPrivacyExport extends Document {
  owner: Types.ObjectId;
  downloadTokenHash: string;
  storageKey: string;
  sizeBytes: number;
  expiresAt: Date;
  downloadedAt?: Date;
  status: 'ready' | 'expired' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

const privacyExportSchema = new Schema<IPrivacyExport>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    downloadTokenHash: { type: String, required: true, select: false },
    storageKey: { type: String, required: true, trim: true, select: false },
    sizeBytes: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    downloadedAt: Date,
    status: {
      type: String,
      enum: ['ready', 'expired', 'deleted'],
      default: 'ready',
      index: true,
    },
  },
  { timestamps: true },
);

privacyExportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PrivacyExport: Model<IPrivacyExport> =
  (models.PrivacyExport as Model<IPrivacyExport> | undefined) ??
  model<IPrivacyExport>('PrivacyExport', privacyExportSchema);
