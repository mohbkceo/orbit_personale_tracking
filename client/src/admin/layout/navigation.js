import { Activity, CalendarDays, ChartNoAxesCombined, CircleGauge, KeyRound, Layers3, QrCode, Settings2, Shield, Users, WandSparkles } from 'lucide-react';

export const adminNavigation = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/admin', icon: CircleGauge, end: true }] },
  { label: 'Management', items: [
    { label: 'Users', to: '/admin/users', icon: Users },
    { label: 'Plans', to: '/admin/plans', icon: Layers3 },
    { label: 'Features', to: '/admin/features', icon: WandSparkles },
    { label: 'Access Control', to: '/admin/access-control', icon: Shield, superOnly: true },
    { label: 'Activation Links', to: '/admin/activation-links', icon: KeyRound },
  ] },
  { label: 'Operations', items: [
    { label: 'QR Batches', to: '/admin/qr-batches', icon: QrCode },
    { label: 'Print Templates', to: '/admin/qr-batches/print-templates', icon: Layers3 },
    { label: 'Events', to: '/admin/events', icon: CalendarDays },
    { label: 'Activity', to: '/admin/activity', icon: Activity },
    { label: 'Payments', to: '/admin/payments', icon: Layers3 },
    { label: 'Analytics', to: '/admin/analytics', icon: ChartNoAxesCombined },
  ] },
  { label: 'System', items: [
    { label: 'Admins', to: '/admin/admins', icon: Shield, superOnly: true },
    { label: 'Settings', to: '/admin/settings', icon: Settings2, superOnly: true },
  ] },
];

export function adminPageLabel(pathname) {
  if (/^\/admin\/users\/[^/]+/.test(pathname)) return 'User details';
  if (pathname.startsWith('/admin/qr-batches/print-templates')) return 'Print Templates';
  if (/^\/admin\/qr-batches\/[^/]+/.test(pathname)) return 'QR batch details';
  if (pathname.startsWith('/admin/settings/')) return pathname.endsWith('/sales-contact') ? 'Sales / Contact' : pathname.endsWith('/events') ? 'Events & Notifications' : 'Automation';
  return adminNavigation.flatMap((group) => group.items).find((item) => item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))?.label || 'Admin';
}
