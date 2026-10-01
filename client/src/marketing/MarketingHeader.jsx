import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const links = [
  ['Features', '/features'],
  ['Pricing', '/pricing'],
  ['About', '/about'],
];

export function MarketingHeader({ onGetStarted }) {
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
        <Link to="/" className="marketing-brand" aria-label="Orbit home">
          <img src="/logo-orbit.png" alt="" />
          <span>Orbit</span>
        </Link>
        <nav aria-label="Public navigation" className="marketing-desktop-nav">
          {links.map(([label, to]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="marketing-header-actions">
          <Link to="/login" className="marketing-sign-in">
            Sign in
          </Link>
          <button
            type="button"
            className="marketing-button marketing-button-primary"
            onClick={onGetStarted}
          >
            Get Started
          </button>
        </div>
        <button
          type="button"
          className="marketing-menu-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
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
          aria-label="Mobile public navigation"
          className="marketing-mobile-nav"
        >
          {links.map(([label, to]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}>
              {label}
            </NavLink>
          ))}
          <Link to="/login" onClick={() => setOpen(false)}>
            Sign in
          </Link>
          <button
            type="button"
            className="marketing-button marketing-button-primary"
            onClick={() => {
              setOpen(false);
              onGetStarted();
            }}
          >
            Get Started
          </button>
        </nav>
      )}
    </header>
  );
}
