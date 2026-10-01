import mongoose from 'mongoose';

const siteConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    sales: {
      whatsappNumber: { type: String, default: '' },
      whatsappMessage: { type: String, default: '' },
    },
  },
  { timestamps: true },
);

export const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);
