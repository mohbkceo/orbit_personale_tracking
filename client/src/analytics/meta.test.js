import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

beforeEach(() => {
  vi.resetModules(); localStorage.clear(); sessionStorage.clear(); document.body.innerHTML = '';
  history.replaceState(null, '', '/');
  vi.stubEnv('VITE_META_PIXEL_ID', '1432887715641697'); vi.stubEnv('VITE_META_PIXEL_ENABLED', 'true');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { granted: true } }) })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function consent() { const { meta } = await import('./meta.js'); await meta.setConsent(true); return meta; }
describe('Meta browser consent, navigation and deduplication', () => {
  it('does not load Pixel or transmit matching data before permission or after refusal', async () => {
    const { meta } = await import('./meta.js'); meta.page(); meta.event({ name: 'Purchase', eventId: 'purchase:1' });
    expect(document.querySelector('iframe')).toBeNull(); expect(meta.headers()).toEqual({});
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { granted: false } }) });
    await meta.setConsent(false); meta.page(); expect(document.querySelector('iframe')).toBeNull();
  });
  it('creates one frame, sanitizes pages and never duplicates PageView on remount', async () => {
    history.replaceState(null, '', '/?fbclid=click123&token=secret&email=private');
    const meta = await consent(); const frame = document.querySelector('iframe');
    const send = vi.spyOn(frame.contentWindow, 'postMessage'); frame.dispatchEvent(new Event('load'));
    meta.page(); meta.page();
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(frame.referrerPolicy).toBe('no-referrer');
    expect(send.mock.calls.filter(([m]) => m.name === 'PageView')).toHaveLength(1);
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/token=|private|secret/);
    history.replaceState(null, '', '/pricing'); meta.page(); meta.page();
    expect(send.mock.calls.filter(([m]) => m.name === 'PageView')).toHaveLength(2);
    history.replaceState(null, '', '/panel/money/accounts'); meta.page();
    history.replaceState(null, '', '/admin'); meta.page();
    history.replaceState(null, '', '/activate/secret-token'); meta.page();
    expect(send.mock.calls.filter(([m]) => m.name === 'PageView')).toHaveLength(2);
    expect(meta.headers()['X-Orbit-Fbc']).toMatch(/^fb\.1\.\d{13}\.click123$/);
  });
  it('uses the server conversion ID once across repeated responses', async () => {
    const meta = await consent(); const frame = document.querySelector('iframe');
    const send = vi.spyOn(frame.contentWindow, 'postMessage'); frame.dispatchEvent(new Event('load'));
    const event = { name: 'Purchase', eventId: 'purchase:order1', data: { value: 2500, currency: 'DZD', content_ids: ['plan1'] } };
    meta.event(event); meta.event(event);
    expect(send.mock.calls.filter(([m]) => m.name === 'Purchase')).toEqual([[{ type: 'event', ...event, path: '/checkout' }, window.location.origin]]);
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { granted: false } }) });
    await meta.setConsent(false); meta.event({ ...event, eventId: 'purchase:order2' });
    expect(send.mock.calls.filter(([m]) => m.name === 'Purchase')).toHaveLength(1);
    expect(meta.headers()).toEqual({});
  });
  it('the official bootstrap initializes fbq once and shares eventID without automatic form tracking', () => {
    const listeners = {}; const scripts = []; const parent = {}; const replaceState = vi.fn();
    const window = { addEventListener: (name, fn) => { listeners[name] = fn; } };
    vm.runInNewContext(fs.readFileSync('public/meta-pixel.js', 'utf8'), {
      window, parent, location: { origin: 'https://orbit.test' }, history: { replaceState },
      document: { createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } },
    });
    const message = (data, origin = 'https://orbit.test') => listeners.message({ source: parent, origin, data });
    message({ type: 'init', pixelId: '1432887715641697' }); message({ type: 'init', pixelId: '1432887715641697' });
    message({ type: 'event', name: 'Purchase', eventId: 'purchase:123', data: { value: 1 }, path: '/checkout' });
    message({ type: 'event', name: 'Purchase', eventId: 'purchase:123', data: {}, path: '/checkout' });
    message({ type: 'event', name: 'Purchase', eventId: 'foreign', path: '/checkout' }, 'https://evil.test');
    expect(scripts).toHaveLength(1); expect(scripts[0].async).toBe(true);
    expect(Array.from(window.fbq.queue[0])).toEqual(['set', 'autoConfig', false, '1432887715641697']);
    expect(window.fbq.queue.filter((args) => args[0] === 'init')).toHaveLength(1);
    const conversions = window.fbq.queue.filter((args) => args[0] === 'trackSingle');
    expect(conversions).toHaveLength(1); expect(conversions[0][4]).toEqual({ eventID: 'purchase:123' });
    message({ type: 'consent', granted: false }); message({ type: 'event', name: 'Purchase', eventId: 'withdrawn', path: '/checkout' });
    expect(window.fbq.queue.filter((args) => args[0] === 'trackSingle')).toHaveLength(1);
  });
});
