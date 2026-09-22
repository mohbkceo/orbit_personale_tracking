import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { useAuth, useAdminAuth } from './context/useAuth.js';
import { AdminLayout, AdminDashboard, AdminUsers, AdminUserDetail, AdminActivationLinks, AdminActivity, AdminAdmins, AdminSettings } from './pages/Admin.jsx';
import { AdminQrBatches, AdminQrBatchDetail } from './pages/admin/QrBatches.jsx';

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

function ProtectedRoute({ children }) {
  const { loading, user, access } = useAuth();
  if (loading) return <Spinner label="Checking access…" />;
  if (!user) return <Navigate to="/login" replace />;
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
  return <Suspense fallback={<Spinner label="Opening Orbit…" />}><Routes>
    <Route path="login" element={<Login/>}/><Route path="activate/:key" element={<Activation/>}/><Route path="access" element={<Access/>}/><Route path="pricing" element={<Pricing/>}/>
    <Route path="admin/login" element={<AdminLogin/>}/>
    <Route path="admin" element={<AdminProtectedRoute><AdminLayout/></AdminProtectedRoute>}>
      <Route index element={<AdminDashboard/>}/><Route path="users" element={<AdminUsers/>}/><Route path="users/:id" element={<AdminUserDetail/>}/><Route path="plans" element={<AdminPlans/>}/><Route path="features" element={<AdminFeatures/>}/><Route path="activation-links" element={<AdminActivationLinks/>}/><Route path="qr-batches" element={<AdminQrBatches/>}/><Route path="qr-batches/:id" element={<AdminQrBatchDetail/>}/><Route path="activity" element={<AdminActivity/>}/>
      <Route path="admins" element={<AdminProtectedRoute superOnly><AdminAdmins/></AdminProtectedRoute>}/><Route path="settings" element={<AdminProtectedRoute superOnly><AdminSettings/></AdminProtectedRoute>}/>
    </Route>
    <Route element={<ProtectedRoute><AppProvider><Layout/></AppProvider></ProtectedRoute>}><Route index element={<Dashboard/>}/><Route path="tasks" element={<Tasks/>}/><Route path="reminders" element={<Reminders/>}/><Route path="money/accounts" element={<Accounts/>}/><Route path="money/transactions" element={<Transactions/>}/><Route path="money/expenses" element={<Transactions mode="expense"/>}/><Route path="money/income" element={<Transactions mode="income"/>}/><Route path="money/debts" element={<Debts/>}/><Route path="planning/bills" element={<Planning kind="bills"/>}/><Route path="planning/subscriptions" element={<Planning kind="subscriptions"/>}/><Route path="planning/goals" element={<Planning kind="goals"/>}/><Route path="personal/:kind" element={<PersonalRoute/>}/><Route path="settings" element={<Settings/>}/><Route path="*" element={<NotFound/>}/></Route>
  </Routes></Suspense>;
}

function PersonalRoute() {
  const { kind } = useParams();
  return ['projects', 'habits', 'wishlist', 'contacts', 'notes'].includes(kind) ? <Personal kind={kind}/> : <NotFound/>;
}
