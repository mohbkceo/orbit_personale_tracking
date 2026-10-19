import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MarketingHeader } from './MarketingHeader.jsx';
import { GetStartedModal } from './GetStartedModal.jsx';
import './marketing.css';
import { useTranslation } from 'react-i18next';

export function MarketingLayout() {
  const { t, i18n } = useTranslation();
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const openGetStarted = useCallback(() => setGetStartedOpen(true), []);
  const closeGetStarted = useCallback(() => setGetStartedOpen(false), []);
  const { pathname } = useLocation();
  useEffect(() => {
    const key = ({ '/': 'home', '/features': 'features', '/about': 'about', '/pricing': 'pricing' })[pathname] || 'home';
    const [title, description] = [t(`marketing:meta.${key}Title`), t(`marketing:meta.${key}Description`)];
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [pathname, i18n.resolvedLanguage, t]);
  return (
    <div className="marketing-shell">
      <MarketingHeader onGetStarted={openGetStarted} />
      <Outlet context={{ openGetStarted }} />
      <GetStartedModal open={getStartedOpen} onClose={closeGetStarted} />
    </div>
  );
}
