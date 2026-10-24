import i18n from '../i18n/index.js';

export function whatsappUrl(sales, leadCode, email) {
  if (sales?.whatsappEnabled === false) return null;
  const number = String(sales?.whatsappNumber || '').replace(/\D/g, '');
  const message = sales?.whatsappMessage?.trim();
  if (!/^[1-9]\d{7,14}$/.test(number) || !message) return null;
  const lines = [message];
  if (leadCode) lines.push(i18n.t('marketing:reference', { reference: leadCode }));
  if (email?.trim()) lines.push(i18n.t('subscribe:accountEmail', { email: email.trim() }));
  return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
}
