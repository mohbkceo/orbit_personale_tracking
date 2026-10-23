import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  Check,
  CirclePlay,
  UsersRound,
  X,
} from 'lucide-react';
import { ProductPreview } from './ProductPreview.jsx';
import { useTranslation } from 'react-i18next';

export default function Landing() {
  const { t } = useTranslation();
  const [demoOpen, setDemoOpen] = useState(false);
  useEffect(() => {
    if (!demoOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setDemoOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [demoOpen]);
  return (
    <main className="marketing-hero">
      <div className="marketing-orbit-ring" aria-hidden="true" />

      <div className="marketing-hero-inner">
        <div className="marketing-hero-copy">
          {/* Eyebrow */}
          <span className="marketing-hero-pill">{t('marketing:heroPill')}</span>

          {/* Main headline */}
          <h1>
            {t('marketing:heroTitle1')}
            <br />
            <span>{t('marketing:heroTitle2')}</span>
          </h1>

          {/* Value proposition */}
          <p>{t('marketing:heroDescription')}</p>

          <div className="marketing-hero-actions">
            <Link
              to="/register"
              className="marketing-button  marketing-button-primary marketing-hero-primary"
            >
              {t('marketing:startFree')}
              <ArrowRight className="rtl-flip" size={19} aria-hidden="true" />
            </Link>

            <button
              type="button"
              className="marketing-button marketing-button-outline"
              onClick={() => setDemoOpen(true)}
            >
              <CirclePlay size={23} aria-hidden="true" />
              {t('marketing:explore')}
            </button>
          </div>

          {/* Registration reassurance */}
          <p className="text-xs pt-3 p-hero mt-6">{t('marketing:reassurance')}</p>

          {/* Key benefits */}
          <div className="marketing-values">
            <div>
              <span>
                <Check size={20} aria-hidden="true" />
              </span>
              {t('marketing:benefitOne')}
            </div>

            <div>
              <span>
                <ChartNoAxesColumnIncreasing size={20} aria-hidden="true" />
              </span>
              {t('marketing:benefitTwo')}
            </div>

            <div>
              <span>
                <UsersRound size={20} aria-hidden="true" />
              </span>
              {t('marketing:benefitThree')}
            </div>
          </div>
        </div>

        {/* Product preview */}
        <div className="marketing-hero-visual">
          <div className="marketing-orange-disc" aria-hidden="true" />
          <ProductPreview />
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
            aria-labelledby="demo-title"
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
            <span className="marketing-eyebrow">{t('marketing:demo')}</span>
            <h2 id="demo-title">{t('marketing:demoTitle')}</h2>
            <ol className="mt-4 space-y-4">
              <li>{t('marketing:demoStepOne')}</li>
              <li>{t('marketing:demoStepTwo')}</li>
              <li>{t('marketing:demoStepThree')}</li>
            </ol>
            <Link to="/pricing" className="marketing-button marketing-button-primary mt-6">
              {t('marketing:choosePlan')} <ArrowRight className="rtl-flip" size={18} />
            </Link>
          </section>
        </div>
      )}
    </main>
  );
}
