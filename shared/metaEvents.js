// One mapping for browser/server deduplication. Manual activation is deliberately absent.
export const META_EVENTS = Object.freeze({
  registration_completed: 'CompleteRegistration',
  checkout_started: 'InitiateCheckout',
  payment_confirmed: 'Purchase',
});
export const advertisingPath = (path) => ['/', '/pricing', '/features', '/about', '/register', '/checkout'].includes(path) ? path : null;
export function metaCustomData(properties = {}) {
  if (!properties.planId) return {};
  return { content_type: 'product', content_ids: [String(properties.planId)],
    ...(Number.isFinite(properties.value) && properties.currency === 'DZD' ? { value: properties.value, currency: 'DZD' } : {}),
    ...(properties.orderId ? { order_id: String(properties.orderId) } : {}) };
}
