import {
  ArrowRight,
  Bell,
  CalendarCheck2,
  CircleDollarSign,
  Goal,
  Landmark,
  Search,
  Send,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marketingContent } from '../i18n/marketingContent.js';

const groupIcons = [CalendarCheck2, WalletCards, Bell, Sparkles];

export default function Features() {
  const { t, i18n } = useTranslation();
  const copy = marketingContent[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'].features;
  return (
    <main className="marketing-page">
      <div className="marketing-page-intro">
        <span className="marketing-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <Link
          to="/register"
          className="marketing-button marketing-button-primary"
        >
          {t('marketing:getStarted')} <ArrowRight className="rtl-flip" size={18} />
        </Link>
      </div>
      <div className="marketing-feature-grid">
        {copy.groups.map(([title, description, items], index) => {
          const Icon = groupIcons[index];
          return <section className="marketing-feature-card" key={index}>
            <div className="marketing-feature-icon">
              <Icon size={23} />
            </div>
            <h2>{title}</h2>
            <p>{description}</p>
            <div className="marketing-feature-items">
              {items.map(([name, detail]) => (
                <div key={name}>
                  <strong>{name}</strong>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </section>;
        })}
      </div>
      <div className="marketing-feature-note">
        <Goal size={20} />
        <span>{copy.notes[0]}</span>
        <CircleDollarSign size={20} />
        <span>{copy.notes[1]}</span>
        <Landmark size={20} />
        <span>{copy.notes[2]}</span>
        <Search size={20} />
        <span>{copy.notes[3]}</span>
        <Send size={20} />
        <span>{copy.notes[4]}</span>
      </div>
    </main>
  );
}
