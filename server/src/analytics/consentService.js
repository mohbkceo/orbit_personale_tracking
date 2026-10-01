import { env } from '../config/env.js';

const name = 'orbit_analytics_consent';
const options = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };

export const analyticsAllowed = (req) => !env.ANALYTICS_REQUIRE_CONSENT || req.cookies?.[name] === 'granted';
export const grantAnalyticsConsent = (res) => res.cookie(name, 'granted', { ...options, maxAge: 365 * 86400000 });
export const clearAnalyticsConsent = (res) => res.clearCookie(name, options);
