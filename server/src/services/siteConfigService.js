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

function formatSales(sales) {
  return {
    whatsappNumber: sales?.whatsappNumber || '',
    whatsappMessage: sales?.whatsappMessage || '',
    salesEmail: sales?.salesEmail || '',
    supportEmail: sales?.supportEmail || '',
    phoneNumber: sales?.phoneNumber || '',
    whatsappEnabled: sales?.whatsappEnabled ?? true,
    contactVisible: sales?.contactVisible ?? false,
  };
}

export async function getSalesConfig() {
  const config = await SiteConfig.findOne({ key: 'site' }).lean();
  return formatSales(config?.sales);
}

export async function updateSalesConfig({ whatsappNumber, whatsappMessage, salesEmail, supportEmail, phoneNumber, whatsappEnabled, contactVisible }) {
  const sales = {
    whatsappNumber: normalizeWhatsAppNumber(whatsappNumber),
    whatsappMessage: whatsappMessage.trim(),
  };
  if (salesEmail !== undefined) sales.salesEmail = salesEmail.trim().toLowerCase();
  if (supportEmail !== undefined) sales.supportEmail = supportEmail.trim().toLowerCase();
  if (phoneNumber !== undefined) sales.phoneNumber = phoneNumber.trim();
  if (whatsappEnabled !== undefined) sales.whatsappEnabled = whatsappEnabled;
  if (contactVisible !== undefined) sales.contactVisible = contactVisible;
  const config = await SiteConfig.findOneAndUpdate(
    { key: 'site' },
    { $set: Object.fromEntries(Object.entries(sales).map(([key, value]) => [`sales.${key}`, value])) },
    { upsert: true, new: true, runValidators: true },
  );
  return formatSales(config.sales);
}
