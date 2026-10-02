import mongoose from 'mongoose';

const siteConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    sales: {
      whatsappNumber: { type: String, default: '' },
      whatsappMessage: { type: String, default: '' },
      salesEmail: { type: String, default: '' },
      supportEmail: { type: String, default: '' },
      phoneNumber: { type: String, default: '' },
      whatsappEnabled: { type: Boolean, default: true },
      contactVisible: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);
