import { SiteConfig } from '../models/SiteConfig.js';

export function normalizeWhatsAppNumber(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (!/^\+?[\d\s().-]+$/.test(input))
    throw new Error('Enter a valid international WhatsApp phone number.');
  const digits = input.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new Error('WhatsApp phone number must contain 8 to 15 international digits.');
  return digits;
}

export async function getSalesConfig() {
  const config = await SiteConfig.findOne({ key: 'site' }).lean();
  return {
    whatsappNumber: config?.sales?.whatsappNumber || '',
    whatsappMessage: config?.sales?.whatsappMessage || '',
  };
}

export async function updateSalesConfig({ whatsappNumber, whatsappMessage }) {
  const sales = {
    whatsappNumber: normalizeWhatsAppNumber(whatsappNumber),
    whatsappMessage: whatsappMessage.trim(),
  };
  const config = await SiteConfig.findOneAndUpdate(
    { key: 'site' },
    { $set: { sales } },
    { upsert: true, new: true, runValidators: true },
  );
  return {
    whatsappNumber: config.sales.whatsappNumber,
    whatsappMessage: config.sales.whatsappMessage,
  };
}
