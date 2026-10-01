import { EVENTS, WEB_EVENT_NAMES } from './events.js';
import { analyticsPath } from '../../../shared/analyticsPath.js';

const initialPath = window.location.pathname;
const consentEnabled = () => { try { return import.meta.env.VITE_ANALYTICS_REQUIRE_CONSENT !== 'true' || localStorage.getItem('orbit-analytics-consent') === 'granted'; } catch { return false; } };
const enabled = () => !window.location.pathname.startsWith('/admin') && consentEnabled();
const queue = [];
let active = null;
let session = null;
let lastActivity = 0;
let timer = null;
let lastPage = '';
let lastPageAt = 0;
const endpoint = '/api/analytics';
const context = (first) => { const url = new URL(window.location.href); url.pathname = analyticsPath(url.pathname); return { landingUrl: url.href, ...(first ? { referrer: document.referrer, entry: true } : {}), locale: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }; };
async function requestWithTimeout(url, options, milliseconds = 4000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}

async function bootstrap(first = false) {
  if (!enabled()) return null;
  if (active) return active;
  active = (async () => {
    if (import.meta.env.VITE_ANALYTICS_REQUIRE_CONSENT === 'true') {
      const consent = await requestWithTimeout(`${endpoint}/consent`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ granted: true }) });
      if (!consent.ok) return null;
    }
    return requestWithTimeout(`${endpoint}/session`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(context(first)) });
  })()
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => { session = payload?.data || null; lastActivity = Date.now(); return session; })
    .catch(() => null)
    .finally(() => { active = null; });
  return active;
}

async function flush(beacon = false) {
  if (!queue.length || !consentEnabled()) return;
  if (!session && !(await bootstrap())) return;
  const events = queue.splice(0, 25);
  const body = JSON.stringify({ events });
  if (beacon && navigator.sendBeacon?.( `${endpoint}/events/batch`, new Blob([body], { type: 'application/json' }))) return;
  try {
    const response = await fetch(`${endpoint}/events/batch`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: beacon });
    if (!response.ok && response.status >= 500) queue.unshift(...events);
  } catch { queue.unshift(...events); }
  if (queue.length > 100) queue.splice(0, queue.length - 100);
}

export const analytics = {
  async start() {
    if (!enabled() || timer) return;
    await bootstrap(!initialPath.startsWith('/admin'));
    if (!timer) {
      timer = window.setInterval(() => { void flush(); }, 5000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(true); });
      window.addEventListener('pagehide', () => { void flush(true); });
    }
  },
  track(name, properties = {}) {
    if (!enabled() || !WEB_EVENT_NAMES.includes(name)) return;
    if (Date.now() - lastActivity > 30 * 60_000) { session = null; void bootstrap(); }
    lastActivity = Date.now();
    queue.push({ eventId: crypto.randomUUID(), name, path: analyticsPath(window.location.pathname), properties, occurredAt: new Date().toISOString() });
    if (queue.length > 100) queue.splice(0, queue.length - 100);
    if (queue.length >= 10) void flush();
  },
  page() { const page = window.location.pathname; if (page === lastPage && Date.now() - lastPageAt < 1000) return; lastPage = page; lastPageAt = Date.now(); this.track(EVENTS.PAGE_VIEWED); },
  async identify() { session = null; await bootstrap(); },
  async session() { return session || bootstrap(); },
  getAttribution() { return session?.attribution || null; },
  async createLead() {
    if (!enabled()) return null;
    await bootstrap();
    try {
      const response = await requestWithTimeout(`${endpoint}/leads`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 3000);
      return response.ok ? (await response.json()).data : null;
    } catch { return null; }
  },
  setConsent(granted) {
    try { localStorage.setItem('orbit-analytics-consent', granted ? 'granted' : 'denied'); } catch { return; }
    if (!granted) { queue.length = 0; session = null; void Promise.resolve(active).finally(() => fetch(`${endpoint}/opt-out`, { method: 'POST', credentials: 'include' }).catch(() => {})); }
    else void this.start();
  },
};
