// Isolated document: Meta never receives the parent URL, auth query or form fields.
// This is the official asynchronous fbq bootstrap with automatic configuration disabled.
(() => {
  let initialized = false;
  let pixelId;
  let allowed = false;
  const ids = new Set();
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== location.origin) return;
    const message = event.data || {};
    if (message.type === 'init' && !initialized && /^\d+$/.test(message.pixelId)) {
      initialized = true;
      pixelId = message.pixelId;
      const fbq = window.fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      window._fbq = fbq;
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      fbq('set', 'autoConfig', false, pixelId);
      fbq('init', pixelId);
      const script = document.createElement('script'); script.async = true;
      script.onload = () => parent.postMessage({ type: typeof window.fbq.callMethod === 'function' ? 'ready' : 'error', pixelId }, location.origin);
      script.onerror = () => parent.postMessage({ type: 'error', pixelId }, location.origin);
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(script);
    }
    if (!initialized) return;
    if (message.type === 'consent') { allowed = message.granted === true; window.fbq('consent', allowed ? 'grant' : 'revoke'); }
    if (message.type !== 'event' || !allowed || ids.has(message.eventId)) return;
    if (!['PageView', 'ViewContent', 'CompleteRegistration', 'InitiateCheckout', 'Purchase'].includes(message.name)) return;
    if (!['/', '/pricing', '/features', '/about', '/register', '/checkout'].includes(message.path)) return;
    ids.add(message.eventId);
    history.replaceState(null, '', message.path);
    window.fbq('trackSingle', pixelId, message.name, message.data, { eventID: message.eventId });
  });
})();
