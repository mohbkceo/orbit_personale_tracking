import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';

const links = [
  ['Features', '/features'],
  ['Pricing', '/pricing'],
  ['About', '/about'],
];

export function MarketingHeader() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Link to="/" className="marketing-brand" aria-label={t('marketing:home')}>
          <img src="/logo-orbit.png" alt="" />
          <span>Orbit</span>
        </Link>
        <nav aria-label={t('marketing:publicNavigation')} className="marketing-desktop-nav">
          {links.map(([label, to]) => (
            <NavLink key={to} to={to}>
              {t(`marketing:${label.toLowerCase()}`)}
            </NavLink>
          ))}
        </nav>
        <div className="marketing-header-actions">
          <LanguageSelector className="marketing-language-selector" />
          <Link to="/login" className="marketing-sign-in">
            {t('auth:signIn')}
          </Link>
          <Link
            to="/register"
            className="marketing-button marketing-button-primary"
          >
            {t('marketing:getStarted')}
          </Link>
        </div>
        <LanguageSelector className="marketing-mobile-language" />
        <button
          type="button"
          className="marketing-menu-toggle"
          aria-label={t(open ? 'marketing:closeMenu' : 'marketing:openMenu')}
          aria-expanded={open}
          aria-controls="marketing-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>
      {open && (
        <nav
          id="marketing-mobile-menu"
          aria-label={t('marketing:mobileNavigation')}
          className="marketing-mobile-nav"
        >
          {links.map(([label, to]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}>
              {t(`marketing:${label.toLowerCase()}`)}
            </NavLink>
          ))}
          <Link to="/login" onClick={() => setOpen(false)}>
            {t('auth:signIn')}
          </Link>
          <Link
            to="/register"
            className="marketing-button marketing-button-primary"
            onClick={() => setOpen(false)}
          >
            {t('marketing:getStarted')}
          </Link>
          <LanguageSelector />
        </nav>
      )}
    </header>
  );
}
