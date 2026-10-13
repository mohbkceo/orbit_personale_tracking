import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { env } from '../config/env.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { AdvertisingConsent } from '../models/AdvertisingConsent.js';
import { User } from '../models/User.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { advertisingConsent } from './advertisingConsent.js';
import { META_EVENTS, metaCustomData } from '../../../shared/metaEvents.js';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export function matchingData({ email, phone, externalId, ip, userAgent, fbp, fbc }) {
  const result = {};
  if (email) result.em = [sha256(email.trim().toLowerCase())];
  // Never infer a country code from an ambiguous local phone number.
  if (/^\+[1-9][\d\s().-]{7,22}$/.test(phone || '')) result.ph = [sha256(phone.replace(/\D/g, ''))];
  if (externalId) result.external_id = [sha256(String(externalId))];
  if (isIP(ip || '')) result.client_ip_address = ip;
  if (userAgent) result.client_user_agent = userAgent.slice(0, 512);
  if (/^fb\.\d\.\d{13}\.\d{1,30}$/.test(fbp || '')) result.fbp = fbp;
  if (/^fb\.\d\.\d{13}\.[A-Za-z\d_-]{1,256}$/.test(fbc || '')) result.fbc = fbc;
  return result;
}
export async function captureAdvertising(req, user, phone, options) {
  const consent = await advertisingConsent(req, user, options);
  if (!consent) return null;
  const userData = matchingData({ email: user.email, externalId: user._id, phone, ip: req.ip,
    userAgent: req.get('User-Agent'), fbp: req.get('X-Orbit-Fbp'), fbc: req.get('X-Orbit-Fbc') });
  return { consent: consent._id, userData };
}
export function metaDelivery(row, advertising) {
  const name = META_EVENTS[row.name];
  if (!name || !advertising) return undefined;
  const event = { event_name: name, event_id: row.eventId, event_time: Math.floor(new Date(row.occurredAt).getTime() / 1000),
    action_source: 'website', event_source_url: `${env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '')}${row.name === 'registration_completed' ? '/register' : '/checkout'}`,
    user_data: advertising.userData, custom_data: metaCustomData(row.properties) };
  return { consent: advertising.consent, state: 'PENDING', attempts: 0, nextAttemptAt: new Date(), payload: encryptSecret(JSON.stringify(event)) };
}
export async function deliverMeta(eventId, fetcher = fetch) {
  if (!env.META_CAPI_ENABLED || !env.META_CAPI_ACCESS_TOKEN || !env.META_PIXEL_ID) return;
  const now = new Date();
  const row = await AnalyticsEvent.findOneAndUpdate({ ...(eventId ? { eventId } : {}), $or: [
    { 'metaDelivery.state': 'PENDING', 'metaDelivery.nextAttemptAt': { $lte: now } },
    { 'metaDelivery.state': 'SENDING', 'metaDelivery.leaseUntil': { $lte: now } },
  ] }, { $set: { 'metaDelivery.state': 'SENDING', 'metaDelivery.leaseUntil': new Date(Date.now() + 30000) }, $inc: { 'metaDelivery.attempts': 1 } }, { new: true }).select('+metaDelivery');
  if (!row) return;
  let state = 'PENDING'; let code = 'PROVIDER_UNAVAILABLE';
  try {
    const consent = await AdvertisingConsent.exists({ _id: row.metaDelivery.consent, granted: true, expiresAt: { $gt: now } });
    const optedOut = row.user && await User.exists({ _id: row.user, advertisingAllowed: false });
    if (!consent || optedOut) { state = 'CANCELLED'; code = 'CONSENT_WITHDRAWN'; }
    else if (now - row.occurredAt > 6 * 86400000) { state = 'DEAD'; code = 'EVENT_TOO_OLD'; }
    else {
      const response = await fetcher(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.META_PIXEL_ID}/events`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.META_CAPI_ACCESS_TOKEN}` },
        body: JSON.stringify({ data: [JSON.parse(decryptSecret(row.metaDelivery.payload))], ...(env.META_CAPI_TEST_EVENT_CODE ? { test_event_code: env.META_CAPI_TEST_EVENT_CODE } : {}) }),
      });
      const body = await response.json();
      if (response.ok && body.events_received === 1) { state = 'SENT'; code = 'ACCEPTED'; }
      else code = `HTTP_${response.status}`;
    }
  } catch { /* Do not log requests, matching data, credentials or provider bodies. */ }
  if (state === 'PENDING' && row.metaDelivery.attempts >= 8) state = 'DEAD';
  await AnalyticsEvent.updateOne({ _id: row._id, 'metaDelivery.state': 'SENDING', 'metaDelivery.attempts': row.metaDelivery.attempts }, {
    $set: { 'metaDelivery.state': state, 'metaDelivery.lastCode': code,
      'metaDelivery.nextAttemptAt': new Date(Date.now() + Math.min(6 * 3600000, 30000 * 4 ** row.metaDelivery.attempts)),
      ...(state === 'SENT' ? { 'metaDelivery.sentAt': new Date() } : {}) },
    ...(['SENT', 'CANCELLED'].includes(state) || code === 'EVENT_TOO_OLD' ? { $unset: { 'metaDelivery.payload': 1 } } : {}),
  });
  return state;
}
export const metaProvider = { send: (event) => deliverMeta(event.eventId) };
