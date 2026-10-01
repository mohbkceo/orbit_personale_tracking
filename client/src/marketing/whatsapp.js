export function whatsappUrl(sales) {
  const number = String(sales?.whatsappNumber || '').replace(/\D/g, '');
  const message = sales?.whatsappMessage?.trim();
  if (!/^[1-9]\d{7,14}$/.test(number) || !message) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
