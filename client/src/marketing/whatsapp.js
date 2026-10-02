export function whatsappUrl(sales, leadCode) {
  if (sales?.whatsappEnabled === false) return null;
  const number = String(sales?.whatsappNumber || '').replace(/\D/g, '');
  const message = sales?.whatsappMessage?.trim();
  if (!/^[1-9]\d{7,14}$/.test(number) || !message) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(leadCode ? `${message}\nReference: ${leadCode}` : message)}`;
}
