import { ArrowRight, Check } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marketingContent } from '../i18n/marketingContent.js';

export default function About() {
  const { openGetStarted } = useOutletContext();
  const { t, i18n } = useTranslation();
  const copy = marketingContent[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'].about;
  return (
    <main className="marketing-page marketing-about">
      <div className="marketing-page-intro">
        <span className="marketing-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </div>
      <div className="marketing-about-grid">
        <section>
          <h2>{copy.sectionTitle}</h2>
          <p>{copy.sectionBody}</p>
          <button
            type="button"
            className="marketing-button marketing-button-primary"
            onClick={openGetStarted}
          >
            {t('marketing:getStarted')} <ArrowRight size={18} />
          </button>
        </section>
        <div className="marketing-about-list">
          {copy.points.map((item) => (
            <div key={item}>
              <span>
                <Check size={17} />
              </span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
