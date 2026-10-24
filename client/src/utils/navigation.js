const oldPanelPaths = ['/tasks', '/reminders', '/settings'];
const oldPanelPrefixes = ['/money/', '/planning/', '/personal/'];

export function loginDestination(next, eligible = true) {
  const fallback = eligible ? '/panel' : '/access';
  if (
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.includes('\\') ||
    Array.from(next).some((char) => char.charCodeAt(0) < 32)
  )
    return fallback;
  const path = next.split(/[?#]/, 1)[0];
  if (oldPanelPaths.includes(path) || oldPanelPrefixes.some((prefix) => path.startsWith(prefix)))
    return `/panel${next}`;
  if (path === '/panel' || path.startsWith('/panel/') || path.startsWith('/activate/') || path === '/checkout' || path === '/checkout/return' || path === '/onboarding' || path === '/subscribe') return next;
  return fallback;
}
