import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/useAuth.js';
import { AdminSidebar } from './AdminSidebar.jsx';
import { AdminHeader } from './AdminHeader.jsx';
import { AdminMobileDrawer } from './AdminMobileDrawer.jsx';
import './admin.css';

export default function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useEffect(() => { closeDrawer(); }, [location.pathname, closeDrawer]);
  async function onLogout() { closeDrawer(); await logout(); navigate('/admin/login', { replace: true }); }
  return <div className="admin-shell min-h-screen bg-canvas text-text">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] border-r border-border lg:block"><AdminSidebar admin={admin} onLogout={onLogout} /></aside>
    <div className="min-w-0 lg:pl-[244px]"><AdminHeader admin={admin} pathname={location.pathname} onOpenMenu={() => setDrawerOpen(true)} /><main id="admin-content" className="admin-main mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></main></div>
    <AdminMobileDrawer open={drawerOpen} onClose={closeDrawer} admin={admin} onLogout={onLogout} />
  </div>;
}
