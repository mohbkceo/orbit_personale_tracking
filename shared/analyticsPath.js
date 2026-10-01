export function analyticsPath(pathname) {
  const path = String(pathname || '/');
  return path.replace(/^\/activate\/[^/]+(?=\/|$)/i, '/activate/:key').replace(/^\/api\/activation\/[^/]+(?=\/|$)/i, '/api/activation/:key').slice(0, 512);
}
