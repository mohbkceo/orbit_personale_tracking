import { advertisingPath } from '../../../shared/metaEvents.js';

const requiredPixelId = '1432887715641697';
const pixelId = import.meta.env.VITE_META_PIXEL_ID || requiredPixelId;
const configured = () => pixelId === requiredPixelId && (import.meta.env.PROD || import.meta.env.VITE_META_PIXEL_ENABLED === 'true');
let granted = false;
let frame = null;
let ready = false;
let frameTimer = null;
let lastPage = '';
let checking = null;
const pending = [];
const sent = new Set();
const queued = new Set();
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
  if (!frame || !ready) { pending.push(message); return; }
  frame.contentWindow.postMessage(message, window.location.origin);
  if (message.type === 'event') {
    const key = `${message.name}:${message.eventId}`;
    queued.delete(key);
    sent.add(key);
    try {
      const parsed = JSON.parse(sessionStorage.getItem('orbit-meta-events') || '[]');
      const stored = Array.isArray(parsed) ? parsed : [];
      sessionStorage.setItem('orbit-meta-events', JSON.stringify([...stored.slice(-199), key]));
    } catch { /* memory fallback */ }
  }
}
function removeFrame() {
  if (frameTimer) window.clearTimeout(frameTimer);
  frameTimer = null;
  frame?.remove(); frame = null; ready = false;
  pending.length = 0; queued.clear(); lastPage = '';
}
function init() {
  if (!configured() || !permitted() || frame) return;
  frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'Optional advertising measurement';
  frame.referrerPolicy = 'no-referrer';
  frame.src = '/meta-pixel.html';
  frame.addEventListener('load', () => {
    if (!permitted()) { removeFrame(); return; }
    ready = false;
    frame.contentWindow.postMessage({ type: 'init', pixelId }, window.location.origin);
    frameTimer = window.setTimeout(() => {
      if (!ready) { console.warn('Meta Pixel iframe did not become ready'); removeFrame(); }
    }, 10000);
  });
  frame.addEventListener('error', () => { console.warn('Meta Pixel iframe did not load'); removeFrame(); });
  document.body.appendChild(frame);
}
window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.pixelId !== pixelId) return;
  if (event.data.type === 'error') { console.warn('Meta Pixel script did not load'); removeFrame(); return; }
  if (event.data.type !== 'ready' || !permitted()) return;
  if (frameTimer) window.clearTimeout(frameTimer);
  frameTimer = null; ready = true;
  for (const message of pending.splice(0)) post(message);
});
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
      // A previous withdrawal may have reached local storage while its server request failed.
      if (granted && choice() === 'denied') {
        try {
          await fetch('/api/analytics/advertising-consent', { method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ granted: false }), signal: AbortSignal.timeout(4000) });
        } catch { /* Retry on the next sync; never re-enable browser tracking. */ }
        granted = false;
      }
      if (permitted()) { captureClick(); this.page(); }
      else { removeFrame(); clearCookies(); }
    })().finally(() => { checking = null; });
    return checking;
  },
  async setConsent(value) {
    granted = false;
    const allow = Boolean(value) && navigator.globalPrivacyControl !== true;
    try { localStorage.setItem('orbit-advertising-consent', allow ? 'granted' : 'denied'); } catch { return false; }
    if (!allow) { click = null; removeFrame(); clearCookies(); }
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
    if (!path) { lastPage = ''; return; }
    if (!permitted() || !configured() || path === lastPage) return;
    lastPage = path; init(); post({ type: 'consent', granted: true });
    this.event({ name: 'PageView', eventId: `page:${crypto.randomUUID()}` }, path);
    if (path === '/' || path === '/pricing') this.event({ name: 'ViewContent', eventId: `view:${crypto.randomUUID()}`, data: { content_name: path === '/' ? 'Orbit workspace' : 'Orbit plans' } }, path);
  },
  event(event, path = '/checkout') {
    if (!configured() || !permitted() || !event?.eventId || !['PageView', 'ViewContent', 'CompleteRegistration', 'InitiateCheckout', 'Purchase'].includes(event.name)) return;
    const key = `${event.name}:${event.eventId}`;
    let stored = [];
    try { const parsed = JSON.parse(sessionStorage.getItem('orbit-meta-events') || '[]'); stored = Array.isArray(parsed) ? parsed : []; } catch { /* memory fallback */ }
    if (sent.has(key) || queued.has(key) || stored.includes(key)) return;
    queued.add(key);
    init(); post({ type: 'consent', granted: true });
    post({ type: 'event', name: event.name, eventId: event.eventId, data: event.data || {}, path: advertisingPath(path) || '/checkout' });
  },
};
window.addEventListener('storage', (event) => { if (event.key === 'orbit-advertising-consent') void meta.sync(); });
