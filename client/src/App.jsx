import { lazy, Suspense } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Accounts = lazy(() => import('./pages/Accounts.jsx'));
const Debts = lazy(() => import('./pages/Debts.jsx'));
const Planning = lazy(() => import('./pages/Planning.jsx'));
const Personal = lazy(() => import('./pages/Personal.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return <Suspense fallback={<Spinner label="Opening Orbit…" />}><Routes><Route element={<Layout/>}><Route index element={<Dashboard/>}/><Route path="tasks" element={<Tasks/>}/><Route path="money/accounts" element={<Accounts/>}/><Route path="money/transactions" element={<Transactions/>}/><Route path="money/expenses" element={<Transactions mode="expense"/>}/><Route path="money/income" element={<Transactions mode="income"/>}/><Route path="money/debts" element={<Debts/>}/><Route path="planning/bills" element={<Planning kind="bills"/>}/><Route path="planning/subscriptions" element={<Planning kind="subscriptions"/>}/><Route path="planning/goals" element={<Planning kind="goals"/>}/><Route path="personal/:kind" element={<PersonalRoute/>}/><Route path="settings" element={<Settings/>}/><Route path="*" element={<NotFound/>}/></Route></Routes></Suspense>;
}

function PersonalRoute() {
  const { kind } = useParams();
  return ['projects', 'habits', 'wishlist', 'contacts', 'notes'].includes(kind) ? <Personal kind={kind}/> : <NotFound/>;
}
