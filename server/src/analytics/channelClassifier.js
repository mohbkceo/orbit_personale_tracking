const SEARCH = new Set(['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com']);
const SOCIAL = new Set(['facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'pinterest.com']);
const SEARCH_SOURCES = new Set(['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex']);
const SOCIAL_SOURCES = new Set(['facebook', 'fb', 'instagram', 'ig', 'meta', 'tiktok', 'twitter', 'x', 'linkedin', 'youtube', 'pinterest']);
const hostMatches = (host, domains) => [...domains].some((domain) => host === domain || host.endsWith(`.${domain}`));

export function classifyChannel(touch, ownHosts = []) {
  const medium = touch.utmMedium?.toLowerCase() || '';
  const source = touch.utmSource?.toLowerCase() || '';
  const host = touch.referrerHost?.toLowerCase() || '';
  const clicks = touch.clickIds || {};
  if (['gclid', 'gbraid', 'wbraid', 'msclkid'].some((key) => clicks[key])) return 'paid_search';
  const socialClick = clicks.fbclid || clicks.ttclid;
  if (socialClick && /^(cpc|ppc|paid|paid_social|social_paid|paidsocial)$/.test(medium)) return 'paid_social';
  if (/^(cpc|ppc|paid)$/.test(medium) && (SOCIAL_SOURCES.has(source) || hostMatches(source, SOCIAL))) return 'paid_social';
  if (/^(cpc|ppc|paid_search|sem)$/.test(medium)) return 'paid_search';
  if (/^(paid_social|social_paid|paidsocial)$/.test(medium)) return 'paid_social';
  if (/^(display|banner|cpm)$/.test(medium)) return 'display';
  if (/^(email|newsletter)$/.test(medium)) return 'email';
  if (/^(affiliate|affiliates)$/.test(medium)) return 'affiliate';
  if (/^(creator|influencer)$/.test(medium)) return 'creator';
  if (/^(organic_social|social|social-media)$/.test(medium)) return 'organic_social';
  if (socialClick) return 'organic_social';
  if (/^(organic|seo)$/.test(medium)) return 'organic_search';
  if (source && (SEARCH_SOURCES.has(source) || hostMatches(source, SEARCH))) return 'organic_search';
  if (source && (SOCIAL_SOURCES.has(source) || hostMatches(source, SOCIAL))) return 'organic_social';
  if (host && !hostMatches(host, ownHosts)) {
    if (hostMatches(host, SEARCH)) return 'organic_search';
    if (hostMatches(host, SOCIAL)) return 'organic_social';
    return 'referral';
  }
  if (source || medium || touch.utmCampaign || touch.utmId) return 'other';
  return 'direct';
}
