import { advertisingPath } from '../../../shared/metaEvents.js';

const pixelId = import.meta.env.VITE_META_PIXEL_ID || '';
const configured = () => /^\d+$/.test(pixelId) && (import.meta.env.PROD || import.meta.env.VITE_META_PIXEL_ENABLED === 'true');
let granted = false;
let frame = null;
let ready = false;
let lastPage = '';
let checking = null;
const pending = [];
const sent = new Set();
const choice = () => { try { return localStorage.getItem('orbit-advertising-consent'); } catch { return 'denied'; } };
const permitted = () => granted && choice() !== 'denied' && navigator.globalPrivacyControl !== true;
const cookie = (name) => document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
let click = new URLSearchParams(window.location.search).get('fbclid');
const clickTime = Date.now();
if (!/^[A-Za-z\d_-]{1,256}$/.test(click || '')) click = null;

function captureClick() {
  if (!permitted() || !click) return;
  document.cookie = `_fbc=fb.1.${clickTime}.${click}; Path=/; Max-Age=7776000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  click = null;
}
function post(message) {
  if (frame && ready) frame.contentWindow.postMessage(message, window.location.origin);
  else pending.push(message);
}
function init() {
  if (!configured() || !permitted() || frame) return;
  frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'Optional advertising measurement';
  frame.referrerPolicy = 'no-referrer';
  frame.src = '/meta-pixel.html';
  frame.addEventListener('load', () => {
    ready = true;
    if (!permitted()) { pending.length = 0; return; }
    post({ type: 'init', pixelId });
    for (const message of pending.splice(0)) post(message);
  });
  document.body.appendChild(frame);
}
function clearCookies() {
  for (const name of ['_fbp', '_fbc']) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    const parts = location.hostname.split('.');
    for (let i = 0; i < parts.length - 1; i += 1) document.cookie = `${name}=; Path=/; Domain=.${parts.slice(i).join('.')}; Max-Age=0; SameSite=Lax`;
  }
}
export const meta = {
  choice,
  async sync() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const response = await fetch('/api/analytics/advertising-consent', { credentials: 'include', signal: AbortSignal.timeout(4000) });
        granted = response.ok && (await response.json()).data?.granted === true;
      } catch { granted = false; }
      if (permitted()) { captureClick(); this.page(); }
      else if (frame) post({ type: 'consent', granted: false });
    })().finally(() => { checking = null; });
    return checking;
  },
  async setConsent(value) {
    granted = false;
    const allow = Boolean(value) && navigator.globalPrivacyControl !== true;
    try { localStorage.setItem('orbit-advertising-consent', allow ? 'granted' : 'denied'); } catch { return false; }
    if (!allow) { pending.length = 0; click = null; post({ type: 'consent', granted: false }); clearCookies(); }
    const response = await fetch('/api/analytics/advertising-consent', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ granted: allow }), signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Unable to save your preference. Please try again.');
    granted = (await response.json()).data?.granted === true;
    if (permitted()) { captureClick(); init(); post({ type: 'consent', granted: true }); this.page(); }
    return granted;
  },
  headers() {
    if (!permitted()) return {};
    const fbp = cookie('_fbp'); const fbc = cookie('_fbc');
    return { ...(/^fb\.\d\.\d{13}\.\d{1,30}$/.test(fbp || '') ? { 'X-Orbit-Fbp': fbp } : {}),
      ...(/^fb\.\d\.\d{13}\.[A-Za-z\d_-]{1,256}$/.test(fbc || '') ? { 'X-Orbit-Fbc': fbc } : {}) };
  },
  page() {
    const path = advertisingPath(window.location.pathname);
    if (!path) { lastPage = ''; if (frame) post({ type: 'consent', granted: false }); return; }
    if (!permitted() || !configured() || path === lastPage) return;
    lastPage = path; init(); post({ type: 'consent', granted: true });
    this.event({ name: 'PageView', eventId: `page:${crypto.randomUUID()}` }, path);
    if (path === '/' || path === '/pricing') this.event({ name: 'ViewContent', eventId: `view:${crypto.randomUUID()}`, data: { content_name: path === '/' ? 'Orbit workspace' : 'Orbit plans' } }, path);
  },
  event(event, path = '/checkout') {
    if (!configured() || !permitted() || !event?.eventId || !['PageView', 'ViewContent', 'CompleteRegistration', 'InitiateCheckout', 'Purchase'].includes(event.name)) return;
    const key = `${event.name}:${event.eventId}`;
    let stored = [];
    try { stored = JSON.parse(sessionStorage.getItem('orbit-meta-events') || '[]'); } catch { /* memory fallback */ }
    if (sent.has(key) || stored.includes(key)) return;
    sent.add(key);
    try { sessionStorage.setItem('orbit-meta-events', JSON.stringify([...stored.slice(-199), key])); } catch { /* memory fallback */ }
    init(); post({ type: 'consent', granted: true });
    post({ type: 'event', name: event.name, eventId: event.eventId, data: event.data || {}, path: advertisingPath(path) || '/checkout' });
  },
};
window.addEventListener('storage', (event) => { if (event.key === 'orbit-advertising-consent') void meta.sync(); });
