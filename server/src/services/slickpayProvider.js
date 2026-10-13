import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Sources and response-contract limitations: docs/COMMERCE-AUDIT.md.
export const slickpayOrigin = (environment) => environment === 'production' ? 'https://prodapi.slick-pay.com' : 'https://devapi.slick-pay.com';
export function paymentsAvailable() {
  return env.SLICKPAY_ENABLED && Boolean(env.SLICKPAY_API_KEY && env.SLICKPAY_RETURN_URL)
    && (env.NODE_ENV !== 'production' || (env.SLICKPAY_ENV === 'production' && env.SLICKPAY_CONTRACT_VERIFIED));
}
export function assertPaymentsAvailable() {
  if (!paymentsAvailable()) throw new AppError('Online payment is unavailable. Please contact Orbit or try again later.', 409, undefined, 'PAYMENTS_DISABLED');
  const url = new URL(env.SLICKPAY_RETURN_URL);
  const origins = env.CLIENT_URL.split(',').map((v) => new URL(v.trim()).origin);
  if (url.protocol !== 'https:' || !origins.includes(url.origin) || url.pathname !== '/checkout/return' || url.search || url.hash || url.username || url.password) {
    throw new AppError('Payment return URL is not configured correctly.', 409, undefined, 'PAYMENT_CONFIGURATION');
  }
}
export function amountMinor(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
export function safePaymentUrl(value, environment) {
  try {
    const url = new URL(value);
    return url.origin === slickpayOrigin(environment) && !url.username && !url.password && !url.search && !url.hash
      && /^\/api\/v2\/users\/invoices\/satim\/payment\/[A-Za-z\d_-]+$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
async function request(path, { method = 'GET', body, environment = env.SLICKPAY_ENV } = {}) {
  let response;
  try {
    response = await fetch(`${slickpayOrigin(environment)}/api/v2/users/invoices${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${env.SLICKPAY_API_KEY}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new AppError('Payment status is uncertain. Check this order again; do not start another payment.', 409, undefined, 'PROVIDER_UNCERTAIN'); }
  if (!response.ok) {
    const rejected = method === 'POST' && response.status === 422;
    throw new AppError(rejected ? 'SlickPay could not accept the billing details. Review them and try again.' : 'Payment could not be verified yet. Please check again.', 409, undefined, rejected ? 'INVOICE_REJECTED' : 'PROVIDER_UNCERTAIN');
  }
  try { return await response.json(); }
  catch { throw new AppError('The payment provider returned an unrecognized response.', 409, undefined, 'PROVIDER_CONTRACT'); }
}
export const slickpayProvider = {
  async createInvoice(order, billing, email) {
    const url = new URL(env.SLICKPAY_RETURN_URL);
    url.searchParams.set('order', String(order._id));
    const result = await request('', { method: 'POST', environment: order.environment, body: {
      amount: order.amountMinor / 100, url: url.href, firstname: billing.firstname, lastname: billing.lastname,
      phone: billing.phone, email, address: billing.address,
      items: [{ name: order.planSnapshot.name, price: order.amountMinor / 100, quantity: 1 }],
    } });
    const paymentUrl = safePaymentUrl(result.url, order.environment);
    if (result.success !== 1 || !/^[1-9]\d*$/.test(String(result.id)) || !paymentUrl) throw new AppError('The invoice response needs support review. Do not submit another payment.', 409, undefined, 'PROVIDER_CONTRACT');
    return { invoiceId: String(result.id), paymentUrl };
  },
  async verifyInvoice(order) {
    if (!/^[1-9]\d*$/.test(order.invoiceId || '')) throw new AppError('Invoice requires support review.', 409, undefined, 'INVOICE_UNKNOWN');
    const result = await request(`/${order.invoiceId}`, { environment: order.environment });
    return verifyInvoiceResponse(result, order);
  },
};
export function verifyInvoiceResponse(result, order) {
  const data = result?.data;
  if (result?.success !== 1 || !data || typeof data !== 'object') throw new AppError('Payment response needs support review.', 409, undefined, 'PROVIDER_CONTRACT');
  if (data.completed !== 1) {
    // No documented terminal failure/cancellation codes: unpaid is still pending.
    if (data.completed === 0 || (result.completed === 0 && data.payment_status === 'unpaid')) return { state: 'PROCESSING' };
    throw new AppError('Payment status is not recognized.', 409, undefined, 'PROVIDER_CONTRACT');
  }
  if ((result.completed !== undefined && result.completed !== 1) || (data.payment_status !== undefined && data.payment_status !== 'paid')) throw new AppError('Payment status is inconsistent.', 409, undefined, 'PROVIDER_CONTRACT');
  const confirmedAmount = amountMinor(data.transaction?.amount);
  if (confirmedAmount !== order.amountMinor || order.currency !== 'DZD') throw new AppError('Payment amount does not match this order. Contact support.', 409, undefined, 'PAYMENT_AMOUNT_MISMATCH');
  // The DZD-only invoice channel is enforced as in SlickPay's official gateway.
  if (data.currency !== undefined && data.currency !== 'DZD') throw new AppError('Payment currency does not match.', 409, undefined, 'PAYMENT_CURRENCY_MISMATCH');
  if (!/^[A-Za-z\d_-]{1,128}$/.test(data.serial || '')) throw new AppError('Payment reference is missing.', 409, undefined, 'PROVIDER_CONTRACT');
  if (data.id !== undefined && String(data.id) !== order.invoiceId) throw new AppError('Invoice does not match this order.', 409, undefined, 'PAYMENT_INVOICE_MISMATCH');
  return { state: 'PAID', amountMinor: confirmedAmount, currency: 'DZD', reference: data.serial };
}
