import {
  Bell,
  CalendarCheck2,
  ChartNoAxesColumnIncreasing,
  Check,
  CircleCheck,
  House,
  Menu,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Search,
  Target,
  Wallet,
  Wifi,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const text = {
  en: {
    aria: 'Orbit mobile dashboard preview with tasks, goals, expenses, and balance',
    greeting: 'Good afternoon, Yacine',
    subheading: 'Here is your day at a glance.',
    today: 'Today',
    tasks: 'Tasks',
    goals: 'Goals',
    expenses: 'Expenses',
    balance: 'Balance',
    taskDetail: '3 due today',
    goalDetail: 'Track your progress',
    expenseDetail: 'This month',
    balanceDetail: 'Across 4 accounts',
    home: 'Home',
    add: 'Add',
    money: 'Money',
    more: 'More',
  },
  ar: {
    aria: 'معاينة لوحة أوربت للهاتف تعرض المهام والأهداف والمصاريف والرصيد',
    greeting: 'مرحبًا يا ياسين',
    subheading: 'هذه نظرة سريعة على يومك.',
    today: 'اليوم',
    tasks: 'المهام',
    goals: 'الأهداف',
    expenses: 'المصاريف',
    balance: 'الرصيد',
    taskDetail: '3 مهام اليوم',
    goalDetail: 'تابع تقدمك',
    expenseDetail: 'هذا الشهر',
    balanceDetail: 'في 4 حسابات',
    home: 'الرئيسية',
    add: 'إضافة',
    money: 'المال',
    more: 'المزيد',
  },
};

export function ProductPreview() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.resolvedLanguage?.startsWith('ar');
  const copy = text[isArabic ? 'ar' : 'en'];

  const metrics = [
    { label: copy.tasks, value: '11', detail: copy.taskDetail, icon: CircleCheck, color: 'orange' },
    { label: copy.goals, value: '4', detail: copy.goalDetail, icon: Target, color: 'green' },
    {
      label: copy.expenses,
      value: isArabic ? '5K دج' : 'DZD 5K',
      detail: copy.expenseDetail,
      icon: ReceiptText,
      color: 'rose',
    },
    {
      label: copy.balance,
      value: isArabic ? '492K دج' : 'DZD 492K',
      detail: copy.balanceDetail,
      icon: Wallet,
      color: 'orange',
    },
  ];

  const tabs = [
    { label: copy.home, icon: House, active: true },
    { label: copy.tasks, icon: CalendarCheck2 },
    { label: copy.add, icon: Plus, add: true },
    { label: copy.money, icon: Wallet },
    { label: copy.more, icon: MoreHorizontal },
  ];

  return (
    <div className="orbit-phone" role="img" aria-label={copy.aria} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="orbit-phone-island" aria-hidden="true" />
      <div className="orbit-phone-screen">
        <div className="orbit-phone-status" dir="ltr" aria-hidden="true">
          <strong>9:41</strong>
          <div className="orbit-phone-status-icons">
            <ChartNoAxesColumnIncreasing size={16} />
            <Wifi size={16} />
            <span className="orbit-phone-battery" />
          </div>
        </div>

        <div className="orbit-phone-header">
          <Menu size={20} />
          <div className="orbit-phone-brand" dir="ltr">
            <strong>Orbit</strong>
            <img src="/logo-orbit.png" alt="" />
          </div>
        </div>

        <div className="orbit-phone-toolbar" aria-hidden="true">
          <div className="orbit-phone-search">
            <Search size={17} />
          </div>
          <div className="orbit-phone-language" dir="ltr">
            <span className={isArabic ? '' : 'active'}>{t('common:english')}</span>
            <span className={isArabic ? 'active' : ''}>{t('common:arabic')}</span>
          </div>
          <Bell size={18} className="orbit-phone-bell" />
          <span className="orbit-phone-ready">
            <Check size={16} />
          </span>
          <span className="orbit-phone-avatar">YB</span>
        </div>

        <div className="orbit-phone-content">
          <div className="orbit-phone-welcome">
            <h2>
              {copy.greeting} <span aria-hidden="true">☀️</span>
            </h2>
            <p>{copy.subheading}</p>
            <small>{copy.today}</small>
          </div>

          <div className="orbit-phone-metrics">
            {metrics.map(({ label, value, detail, icon: Icon, color }) => (
              <div className="orbit-phone-metric" key={label}>
                <span className={`orbit-phone-metric-icon ${color}`}>
                  <Icon size={23} />
                </span>
                <strong dir="auto">{value}</strong>
                <span className="orbit-phone-metric-label">{label}</span>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="orbit-phone-bottomnav" aria-hidden="true">
          {tabs.map(({ label, icon: Icon, active, add }) => (
            <div
              key={label}
              className={`orbit-phone-tab${active ? ' is-active' : ''}${add ? ' is-add' : ''}`}
            >
              <span>
                <Icon size={add ? 24 : 21} />
              </span>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
