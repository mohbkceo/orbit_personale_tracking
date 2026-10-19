import {
  Bell,
  CalendarCheck2,
  Check,
  CircleDollarSign,
  Goal,
  Landmark,
  LayoutList,
  Menu,
  Search,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { marketingContent } from '../i18n/marketingContent.js';

const menu = [
  ['Home', LayoutList],
  ['Tasks', CalendarCheck2],
  ['Goals', Goal],
  ['Expenses', CircleDollarSign],
  ['Debts', Landmark],
  ['Reminders', Bell],
];
export function ProductPreview() {
  const { t, i18n } = useTranslation();
  const copy = marketingContent[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'].preview;
  return (
    <div
      className="marketing-preview"
      role="img"
      aria-label={copy.aria}
    >
      <aside className="marketing-preview-sidebar">
        <div className="marketing-preview-brand">
          <img src="/logo-orbit.png" alt="" />
          Orbit
        </div>
        <div className="marketing-preview-menu">
          {menu.map(([label, Icon], index) => (
            <div key={label} className={index === 0 ? 'active' : ''}>
              <Icon size={14} />
              <span>{t(`navigation:${label.toLowerCase()}`)}</span>
            </div>
          ))}
        </div>
        <div className="marketing-preview-settings">
          <Settings size={14} /> {t('settings')}
        </div>
      </aside>
      <div className="marketing-preview-main">
        <div className="marketing-preview-top">
          <Menu size={15} className="marketing-preview-menu-icon" />
          <div className="marketing-preview-search">
            <Search size={14} />
            {t('search')}
          </div>
          <Bell size={15} />
          <span className="marketing-preview-avatar">A</span>
        </div>
        <div className="marketing-preview-content">
          <div className="marketing-preview-greeting">
            <div>
              <strong>
                {copy.greeting} <span>☀</span>
              </strong>
              <small>{copy.greetingDetail}</small>
            </div>
            <small>{t('today')}</small>
          </div>
          <div className="marketing-preview-stats">
            <div>
              <span className="orange">
                <Check size={16} />
              </span>
              <strong>12</strong>
              <small>{t('navigation:tasks')}</small>
              <em>{copy.dueToday}</em>
            </div>
            <div>
              <span className="green">
                <Goal size={16} />
              </span>
              <strong>3</strong>
              <small>{t('navigation:goals')}</small>
              <em>{copy.onTrack}</em>
            </div>
            <div>
              <span className="blue">
                <CircleDollarSign size={16} />
              </span>
              <strong>$892</strong>
              <small>{t('navigation:expenses')}</small>
              <em>{t('telegram:thisMonth')}</em>
            </div>
            <div>
              <span className="orange">
                <Landmark size={16} />
              </span>
              <strong>$1,200</strong>
              <small>{copy.debt}</small>
              <em>{copy.acrossAccounts}</em>
            </div>
          </div>
          <div className="marketing-preview-grid">
            <section>
              <h3>
                {t('navigation:tasks')} <span>{copy.viewAll}</span>
              </h3>
              {copy.tasks.map((task, i) => (
                <div className="marketing-preview-task" key={task}>
                  <span className={i === 0 ? 'done' : ''}>{i === 0 && <Check size={10} />}</span>
                  <p>{task}</p>
                  <small>{i === 2 ? copy.tomorrow : t('today')}</small>
                </div>
              ))}
            </section>
            <section>
              <h3>
                {t('navigation:goals')} <span>{copy.viewAll}</span>
              </h3>
              {[68, 40, 25].map((amount, index) => (
                <div className="marketing-preview-goal" key={index}>
                  <p>{copy.goals[index]}</p>
                  <div>
                    <span style={{ width: `${amount}%` }} />
                  </div>
                </div>
              ))}
            </section>
            <section>
              <h3>
                {t('navigation:expenses')} <span>{copy.viewAll}</span>
              </h3>
              {['$320', '$210', '$180'].map((amount, index) => (
                <div className="marketing-preview-row" key={index}>
                  <span>{copy.expenses[index]}</span>
                  <b>{amount}</b>
                </div>
              ))}
            </section>
            <section>
              <h3>
                {t('navigation:reminders')} <span>{copy.viewAll}</span>
              </h3>
              {copy.reminders.map((label, index) => (
                <div className="marketing-preview-row" key={index}>
                  <span>{label}</span>
                  <b>{index === 2 ? copy.tomorrow : t('today')}</b>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
