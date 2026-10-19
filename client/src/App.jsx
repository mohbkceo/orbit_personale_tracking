import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Spinner } from './components/ui.jsx';
import { AuthProvider, AdminAuthProvider } from './context/AuthContext.jsx';
import { useAuth, useAdminAuth } from './context/useAuth.js';
import { MarketingLayout } from './marketing/MarketingLayout.jsx';
import { analytics } from './analytics/client.js';
import { AdvertisingConsent } from './analytics/AdvertisingConsent.jsx';
import { meta } from './analytics/meta.js';
import { FeatureGate } from './components/FeatureGate.jsx';
import { useTranslation } from 'react-i18next';

function LocaleGate() {
  const { loading } = useAuth();
  if (loading) return <Spinner />;
  return <Outlet />;
}

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Reminders = lazy(() => import('./pages/Reminders.jsx'));
const Events = lazy(() => import('./pages/Events.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Accounts = lazy(() => import('./pages/Accounts.jsx'));
const Debts = lazy(() => import('./pages/Debts.jsx'));
const Planning = lazy(() => import('./pages/Planning.jsx'));
const Personal = lazy(() => import('./pages/Personal.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const AdminPayments = lazy(() => import('./pages/AdminPayments.jsx'));
const Activation = lazy(() => import('./pages/Activation.jsx'));
const Access = lazy(() => import('./pages/Access.jsx'));
const AdminLogin = lazy(() => import('./pages/AdminLogin.jsx'));
const AdminPlans = lazy(() => import('./pages/AdminPlans.jsx'));
const AdminFeatures = lazy(() => import('./pages/AdminFeatures.jsx'));
const Pricing = lazy(() => import('./pages/Pricing.jsx'));
const Landing = lazy(() => import('./marketing/Landing.jsx'));
const Features = lazy(() => import('./marketing/Features.jsx'));
const About = lazy(() => import('./marketing/About.jsx'));
const PanelShell = lazy(() => import('./components/PanelShell.jsx'));
const adminPage = (name) =>
  lazy(() => import('./pages/Admin.jsx').then((module) => ({ default: module[name] })));
const AdminLayout = lazy(() => import('./admin/layout/AdminLayout.jsx'));
const AdminDashboard = adminPage('AdminDashboard');
const AdminUsers = adminPage('AdminUsers');
const AdminUserDetail = adminPage('AdminUserDetail');
const AdminActivationLinks = adminPage('AdminActivationLinks');
const AdminActivity = adminPage('AdminActivity');
const AdminAdmins = adminPage('AdminAdmins');
const AdminSettingsLayout = lazy(() => import('./admin/settings/AdminSettingsLayout.jsx'));
const AdminSalesContactSettings = lazy(() => import('./admin/settings/SalesContactSettings.jsx'));
const AdminQrBatches = lazy(() =>
  import('./pages/admin/QrBatches.jsx').then((module) => ({ default: module.AdminQrBatches })),
);
const AdminQrBatchDetail = lazy(() =>
  import('./pages/admin/QrBatches.jsx').then((module) => ({ default: module.AdminQrBatchDetail })),
);
const AdminQrPrintTemplates = lazy(() => import('./pages/admin/QrPrintTemplates.jsx').then((module) => ({ default: module.AdminQrPrintTemplates })));
const AdminQrPrintTemplateEditor = lazy(() => import('./pages/admin/QrPrintTemplates.jsx').then((module) => ({ default: module.AdminQrPrintTemplateEditor })));
const AdminAutomationSettings = lazy(() => import('./pages/admin/AutomationSettings.jsx'));
const AdminEventSettings = lazy(() => import('./pages/admin/EventSettings.jsx'));
const AdminEvents = lazy(() => import('./pages/admin/Events.jsx'));
const AdminAnalytics = lazy(() => import('./pages/admin/analytics/Analytics.jsx'));
const AdminAccessControl = lazy(() => import('./pages/AdminAccessControl.jsx'));
const gate = (featureKey, child) => <FeatureGate featureKey={featureKey}>{child}</FeatureGate>;

function ProtectedRoute({ children }) {
  const { t } = useTranslation();
  const { loading, user, access, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label={t('auth:checkingAccess')} />;
  if (error && !user) return <main className="grid min-h-screen place-items-center bg-canvas"><div className="panel p-6"><p>{t('auth:sessionError', { error })}</p><button className="btn-primary mt-4" onClick={refresh}>{t('retry')}</button></div></main>;
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );
  if (!access?.eligible) return <Navigate to="/access" replace />;
  return children;
}

function AdminProtectedRoute({ children, superOnly = false }) {
  const { loading, admin } = useAdminAuth();
  if (loading) return <Spinner label="Checking admin access…" />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  if (superOnly && admin.role !== 'SUPER_ADMIN') return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  const { i18n } = useTranslation();
  useEffect(() => {
    const admin = location.pathname.startsWith('/admin');
    const language = admin ? 'en' : i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [location.pathname, i18n.resolvedLanguage]);
  useEffect(() => { void meta.sync(); }, []);
  useEffect(() => { meta.page(); }, [location.pathname]);
  useEffect(() => { if (!location.pathname.startsWith('/admin')) { void analytics.start(); analytics.page(); } }, [location.pathname]);
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<AuthProvider><LocaleGate /></AuthProvider>}>
        <Route element={<MarketingLayout />}>
          <Route index element={<Landing />} />
          <Route path="features" element={<Features />} />
          <Route path="about" element={<About />} />
          <Route path="pricing" element={<Pricing />} />
        </Route>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="checkout/return" element={<Checkout />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="activate/:key" element={<Activation />} />
          <Route path="access" element={<Access />} />
          <Route
            path="panel"
            element={
              <ProtectedRoute>
                <PanelShell />
              </ProtectedRoute>
            }
          >
            <Route index element={gate('dashboard', <Dashboard />)} />
            <Route path="tasks" element={gate('tasks', <Tasks />)} />
            <Route path="reminders" element={gate('reminders', <Reminders />)} />
            <Route path="events" element={gate('events', <Events />)} />
            <Route path="money/accounts" element={gate('accounts', <Accounts />)} />
            <Route path="money/transactions" element={gate('transactions', <Transactions />)} />
            <Route path="money/expenses" element={gate('expenses', <Transactions mode="expense" />)} />
            <Route path="money/income" element={gate('income', <Transactions mode="income" />)} />
            <Route path="money/debts" element={gate('debts', <Debts />)} />
            <Route path="planning/bills" element={gate('bills', <Planning kind="bills" />)} />
            <Route path="planning/subscriptions" element={gate('subscriptions', <Planning kind="subscriptions" />)} />
            <Route path="planning/goals" element={gate('goals', <Planning kind="goals" />)} />
            <Route path="personal/:kind" element={<PersonalRoute />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route
          element={
            <AdminAuthProvider>
              <Outlet />
            </AdminAuthProvider>
          }
        >
          <Route path="admin/login" element={<AdminLogin />} />
          <Route
            path="admin"
            element={
              <AdminProtectedRoute>
                <AdminLayout />
              </AdminProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUserDetail />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="features" element={<AdminFeatures />} />
            <Route path="access-control" element={<AdminProtectedRoute superOnly><AdminAccessControl /></AdminProtectedRoute>} />
            <Route path="activation-links" element={<AdminActivationLinks />} />
            <Route path="qr-batches" element={<AdminQrBatches />} />
            <Route path="qr-batches/print-templates" element={<AdminQrPrintTemplates />} />
            <Route path="qr-batches/print-templates/:id" element={<AdminQrPrintTemplateEditor />} />
            <Route path="qr-batches/:id" element={<AdminQrBatchDetail />} />
            <Route path="activity" element={<AdminActivity />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="analytics/*" element={<AdminAnalytics />} />
            <Route
              path="admins"
              element={
                <AdminProtectedRoute superOnly>
                  <AdminAdmins />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <AdminProtectedRoute superOnly>
                  <AdminSettingsLayout />
                </AdminProtectedRoute>
              }
            >
              <Route index element={<Navigate to="automation" replace />} />
              <Route path="automation" element={<AdminAutomationSettings />} />
              <Route path="events" element={<AdminEventSettings />} />
              <Route path="sales-contact" element={<AdminSalesContactSettings />} />
            </Route>
          </Route>
        </Route>
        <Route path="tasks" element={<LegacyPanelRedirect />} />
        <Route path="reminders" element={<LegacyPanelRedirect />} />
        <Route path="settings" element={<LegacyPanelRedirect />} />
        <Route path="money/*" element={<LegacyPanelRedirect />} />
        <Route path="planning/*" element={<LegacyPanelRedirect />} />
        <Route path="personal/*" element={<LegacyPanelRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AdvertisingConsent />
    </Suspense>
  );
}

function LegacyPanelRedirect() {
  const location = useLocation();
  return <Navigate to={`/panel${location.pathname}${location.search}${location.hash}`} replace />;
}

function PersonalRoute() {
  const { kind } = useParams();
  return ['projects', 'habits', 'wishlist', 'contacts', 'notes'].includes(kind) ? (
    gate(kind, <Personal kind={kind} />)
  ) : (
    <NotFound />
  );
}
