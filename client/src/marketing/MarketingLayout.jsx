import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MarketingHeader } from './MarketingHeader.jsx';
import { GetStartedModal } from './GetStartedModal.jsx';
import './marketing.css';

const pageMeta = {
  '/': [
    'Orbit — Organize your work. Track your life.',
    'Bring tasks, goals, money and reminders into one simple, beautiful space.',
  ],
  '/features': [
    'Orbit Features — Tasks, Money, Goals and Reminders',
    'Explore the tools Orbit provides for organizing your life.',
  ],
  '/about': [
    'About Orbit',
    'Learn how Orbit brings your plans, money and reminders into one organized workspace.',
  ],
  '/pricing': ['Orbit Pricing', 'Explore Orbit access plans and included features.'],
};

export function MarketingLayout() {
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const openGetStarted = useCallback(() => setGetStartedOpen(true), []);
  const closeGetStarted = useCallback(() => setGetStartedOpen(false), []);
  const { pathname } = useLocation();
  useEffect(() => {
    const [title, description] = pageMeta[pathname] || pageMeta['/'];
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [pathname]);
  return (
    <div className="marketing-shell">
      <MarketingHeader onGetStarted={openGetStarted} />
      <Outlet context={{ openGetStarted }} />
      <GetStartedModal open={getStartedOpen} onClose={closeGetStarted} />
    </div>
  );
}
