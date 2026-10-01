import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Spinner } from './components/ui.jsx';
import { AuthProvider, AdminAuthProvider } from './context/AuthContext.jsx';
import { useAuth, useAdminAuth } from './context/useAuth.js';
import { MarketingLayout } from './marketing/MarketingLayout.jsx';
import { analytics } from './analytics/client.js';
import { AnalyticsConsent } from './analytics/AnalyticsConsent.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Reminders = lazy(() => import('./pages/Reminders.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Accounts = lazy(() => import('./pages/Accounts.jsx'));
const Debts = lazy(() => import('./pages/Debts.jsx'));
const Planning = lazy(() => import('./pages/Planning.jsx'));
const Personal = lazy(() => import('./pages/Personal.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
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
const AdminLayout = adminPage('AdminLayout');
const AdminDashboard = adminPage('AdminDashboard');
const AdminUsers = adminPage('AdminUsers');
const AdminUserDetail = adminPage('AdminUserDetail');
const AdminActivationLinks = adminPage('AdminActivationLinks');
const AdminActivity = adminPage('AdminActivity');
const AdminAdmins = adminPage('AdminAdmins');
const AdminSettings = adminPage('AdminSettings');
const AdminQrBatches = lazy(() =>
  import('./pages/admin/QrBatches.jsx').then((module) => ({ default: module.AdminQrBatches })),
);
const AdminQrBatchDetail = lazy(() =>
  import('./pages/admin/QrBatches.jsx').then((module) => ({ default: module.AdminQrBatchDetail })),
);
const AdminAutomationSettings = lazy(() => import('./pages/admin/AutomationSettings.jsx'));
const AdminAnalytics = lazy(() => import('./pages/admin/analytics/Analytics.jsx'));

function ProtectedRoute({ children }) {
  const { loading, user, access } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking access…" />;
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
  useEffect(() => { if (!location.pathname.startsWith('/admin')) { void analytics.start(); analytics.page(); } }, [location.pathname]);
  return (
    <Suspense fallback={<Spinner label="Opening Orbit…" />}>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route index element={<Landing />} />
          <Route path="features" element={<Features />} />
          <Route path="about" element={<About />} />
          <Route path="pricing" element={<Pricing />} />
        </Route>
        <Route
          element={
            <AuthProvider>
              <Outlet />
            </AuthProvider>
          }
        >
          <Route path="login" element={<Login />} />
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
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="money/accounts" element={<Accounts />} />
            <Route path="money/transactions" element={<Transactions />} />
            <Route path="money/expenses" element={<Transactions mode="expense" />} />
            <Route path="money/income" element={<Transactions mode="income" />} />
            <Route path="money/debts" element={<Debts />} />
            <Route path="planning/bills" element={<Planning kind="bills" />} />
            <Route path="planning/subscriptions" element={<Planning kind="subscriptions" />} />
            <Route path="planning/goals" element={<Planning kind="goals" />} />
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
            <Route path="features" element={<AdminFeatures />} />
            <Route path="activation-links" element={<AdminActivationLinks />} />
            <Route path="qr-batches" element={<AdminQrBatches />} />
            <Route path="qr-batches/:id" element={<AdminQrBatchDetail />} />
            <Route path="activity" element={<AdminActivity />} />
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
                  <AdminSettings />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="settings/automation"
              element={
                <AdminProtectedRoute superOnly>
                  <AdminAutomationSettings />
                </AdminProtectedRoute>
              }
            />
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
      <AnalyticsConsent />
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
    <Personal kind={kind} />
  ) : (
    <NotFound />
  );
}
