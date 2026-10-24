import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CirclePlay, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProductPreview } from './ProductPreview.jsx';
import './landing-hero.css';

export default function Landing() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.resolvedLanguage?.startsWith('ar');
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    if (!demoOpen) return undefined;

    const onEscape = (event) => {
      if (event.key === 'Escape') setDemoOpen(false);
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [demoOpen]);

  return (
    <main className="marketing-hero orbit-showcase" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="marketing-hero-inner">
        <section className="marketing-hero-copy" aria-labelledby="orbit-hero-title">
          <h1 id="orbit-hero-title">
            <span className="orbit-showcase-title-line">{t('marketing:heroTitle1')}</span>
            <span className="orbit-showcase-title-line orbit-showcase-title-accent">
              {t('marketing:heroTitle2')}
            </span>
          </h1>

          <div className="marketing-hero-actions">
            <Link
              to="/register"
              className="marketing-button marketing-button-primary marketing-hero-primary"
            >
              {t('marketing:startFree')}
              <ArrowRight className="rtl-flip" size={21} aria-hidden="true" />
            </Link>

            <button
              type="button"
              className="marketing-button marketing-button-outline"
              onClick={() => setDemoOpen(true)}
            >
              <CirclePlay size={22} aria-hidden="true" />
              {t('marketing:explore')}
            </button>
          </div>
        </section>

        <div className="marketing-hero-visual">
          <div className="marketing-orange-disc" aria-hidden="true" />
          <div className="marketing-orbit-ring" aria-hidden="true" />
          <div className="orbit-showcase-phone-position">
            <ProductPreview />
          </div>
        </div>
      </div>

      {demoOpen && (
        <div
          className="marketing-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDemoOpen(false);
          }}
        >
          <section
            className="marketing-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orbit-demo-title"
          >
            <button
              type="button"
              autoFocus
              className="marketing-modal-close"
              aria-label={t('marketing:close')}
              onClick={() => setDemoOpen(false)}
            >
              <X size={20} />
            </button>
            <h2 id="orbit-demo-title">{t('marketing:demoTitle')}</h2>
            <ol className="mt-4 space-y-4">
              <li>{t('marketing:demoStepOne')}</li>
              <li>{t('marketing:demoStepTwo')}</li>
              <li>{t('marketing:demoStepThree')}</li>
            </ol>
            <Link
              to="/register"
              onClick={() => setDemoOpen(false)}
              className="marketing-button marketing-button-primary mt-6"
            >
              {t('marketing:startFree')}
              <ArrowRight className="rtl-flip" size={18} aria-hidden="true" />
            </Link>
          </section>
        </div>
      )}
    </main>
  );
}
