export const emptyFilters = { status: 'ALL', subscription: 'ALL', telegram: 'ALL', planIds: [], expiringDays: 30, search: '' };
export const newSelection = () => ({ filters: { ...emptyFilters, telegram: 'CONNECTED' }, allMatching: true, includeIds: [], excludeIds: [] });
export const newBroadcast = () => ({ name: '', description: '', category: 'ANNOUNCEMENT', channel: 'telegram', variants: { en: { text: '' }, ar: { text: '' } }, imageId: null, buttons: [], audience: newSelection() });
export const cleanSelection = (selection) => ({ ...selection, filters: { ...emptyFilters, ...selection.filters } });
export function recipientMode(selection) {
  const { filters, allMatching, includeIds, excludeIds } = cleanSelection(selection);
  if (filters.telegram === 'NOT_CONNECTED' || !allMatching || includeIds.length || excludeIds.length || filters.search || filters.planIds.length || filters.status !== 'ALL' || Object.keys(filters).some((key) => !Object.hasOwn(emptyFilters, key))) return 'select';
  return filters.subscription === 'ACTIVE' ? 'active' : filters.subscription === 'FREE' ? 'free' : filters.subscription === 'ALL' ? 'all' : 'select';
}
export function presetSelection(mode) {
  return mode === 'select' ? { filters: { ...emptyFilters }, allMatching: false, includeIds: [], excludeIds: [] } : { ...newSelection(), filters: { ...newSelection().filters, subscription: mode === 'active' ? 'ACTIVE' : mode === 'free' ? 'FREE' : 'ALL' } };
}
export function toggleUser(selection, id) {
  const field = selection.allMatching ? 'excludeIds' : 'includeIds';
  return { ...selection, [field]: selection[field].includes(id) ? selection[field].filter((value) => value !== id) : [...selection[field], id] };
}
export const isSelected = (selection, id) => selection.allMatching ? !selection.excludeIds.includes(id) : selection.includeIds.includes(id);
export const hasRecipients = (selection) => selection.allMatching || selection.includeIds.length > 0;
export const errorMessage = (error) => Object.values(error.errors || {}).flat().join(' · ') || error.message;
export function validButtons(rows) {
  return rows.length <= 8 && rows.every((row) => row.length > 0 && row.length <= 4 && row.every((button) => {
    if (!button.label?.trim() || button.label.length > 64) return false;
    if (button.action) return ['ACK', 'PROMO_OPTOUT'].includes(button.action);
    try { const url = new URL(button.url); return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2048; } catch { return false; }
  }));
}
export function broadcastPayload(form) {
  const en = form.variants.en.text.trim();
  const ar = form.variants.ar.text.trim();
  return { name: form.name || (en || ar).replace(/<[^>]*>/g, '').split('\n')[0].slice(0, 120) || 'Broadcast', description: form.description || '', category: form.category, channel: 'telegram', variants: { en: { text: en || ar }, ar: { text: ar || en } }, imageId: form.imageId, buttons: form.buttons, audience: cleanSelection(form.audience) };
}
export function broadcastStatus(row) {
  return ({ DRAFT: 'Draft', PREPARING: row.scheduledAt ? 'Scheduled' : 'Sending', SCHEDULED: 'Scheduled', SENDING: 'Sending', PAUSED: 'Paused', COMPLETED: 'Sent', CANCELLED: 'Cancelled', FAILED: 'Failed' })[row.status] || 'Draft';
}
export const firstLine = (row) => (row.variants?.en?.text || row.variants?.ar?.text || row.name).replace(/<[^>]*>/g, '').split('\n')[0];
