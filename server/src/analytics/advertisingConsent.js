import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AdvertisingConsent } from '../models/AdvertisingConsent.js';
import { User } from '../models/User.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { PaymentOrder } from '../models/PaymentOrder.js';

const cookie = 'orbit_ads_consent';
const options = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
export function consentId(req) {
  try {
    const value = jwt.verify(req.cookies?.[cookie], env.AUTH_JWT_SECRET, { issuer: 'orbit-ads' });
    return /^[a-f\d]{24}$/i.test(value.sub) ? value.sub : null;
  } catch { return null; }
}
export async function advertisingConsent(req, user, { claim = true } = {}) {
  if (req.get('Sec-GPC') === '1' || user?.advertisingAllowed === false) return null;
  const id = consentId(req);
  if (!id) return null;
  const consent = await AdvertisingConsent.findOne({ _id: id, granted: true, expiresAt: { $gt: new Date() } });
  if (consent?.user && String(consent.user) !== String(user?._id)) return null;
  if (claim && consent && user && !consent.user) await AdvertisingConsent.updateOne({ _id: id, user: null }, { $set: { user: user._id } });
  return consent;
}
export async function setAdvertisingConsent(req, res, granted, user) {
  granted = granted && req.get('Sec-GPC') !== '1';
  const previous = consentId(req);
  const filter = user ? { $or: [{ user: user._id }, ...(previous ? [{ _id: previous }] : [])] } : previous ? { _id: previous } : null;
  if (filter) {
    const ids = await AdvertisingConsent.find(filter).distinct('_id');
    await AdvertisingConsent.updateMany(filter, { $set: { granted: false } });
    await AnalyticsEvent.updateMany({ 'metaDelivery.consent': { $in: ids }, 'metaDelivery.state': { $in: ['PENDING', 'SENDING', 'DEAD'] } }, { $set: { 'metaDelivery.state': 'CANCELLED' }, $unset: { 'metaDelivery.payload': 1 } });
    if (user) await PaymentOrder.updateMany({ user: user._id }, { $unset: { advertising: 1 } });
  }
  if (user) await User.updateOne({ _id: user._id }, { $set: { advertisingAllowed: granted } });
  if (granted) {
    const record = await AdvertisingConsent.create({ granted: true, ...(user ? { user: user._id } : {}), expiresAt: new Date(Date.now() + 180 * 86400000) });
    res.cookie(cookie, jwt.sign({ sub: String(record._id) }, env.AUTH_JWT_SECRET, { issuer: 'orbit-ads', expiresIn: '180d' }), { ...options, maxAge: 180 * 86400000 });
  } else res.clearCookie(cookie, options);
  return granted;
}
