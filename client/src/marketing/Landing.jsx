import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  HandCoins,
  ListTodo,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { analytics } from '../analytics/client.js';
import { EVENTS } from '../analytics/events.js';
import { ProductPreview } from './ProductPreview.jsx';
import './landing-hero.css';
import './landing-conversion.css';

const TELEGRAM_SCREENSHOTS = {
  expense: '/images/orbit-telegram/expense.webp',
  task: '/images/orbit-telegram/task.webp',
  debt: '/images/orbit-telegram/debt.webp',
};

const COPY = {
  en: {
    eyebrow: 'Your everyday life, finally organized',
    heroTop: 'Tasks, money & reminders.',
    heroAccent: 'All in one place.',
    heroBody:
      'Record expenses, keep track of debts, manage your tasks and stay on top of what matters. Orbit keeps it simple.',
    explore: 'See how it works',
    reassurance: ['Free to start', 'No credit card needed', 'Telegram is optional'],
    previewCaption: 'Illustrative dashboard preview',
    floatingTitle: 'A calmer way to stay organized',
    floatingBody: 'Less switching between notes, apps and messages.',
    sectionLabel: 'Chat with Orbit',
    demoTitle: 'Send a message. Orbit organizes it.',
    demoIntro: 'Real conversations with Orbit Bot on Telegram. Choose an example.',
    chatBotName: 'Orbit Bot',
    chatBotSubtitle: 'Example conversation',
    chatTryLabel: 'Choose an example',
    chatToday: 'Today',
    chatComposer: 'Choose an example above',
    demoTabs: [
      {
        id: 'expense',
        label: 'Expense',
        caption: 'Expense recorded: 1,500 DZD — Flexy Ooredoo.',
        alt: 'Orbit Telegram bot: message spent 1500 Flexy Ooredoo; bot confirms an expense of 1,500 DZD.',
      },
      {
        id: 'task',
        label: 'Task',
        caption: 'Task added: collect goods from Port d’Alger.',
        alt: 'Orbit Telegram bot: user asks to collect goods from Port d’Alger; bot confirms the task with medium priority.',
      },
      {
        id: 'debt',
        label: 'Debt',
        caption: 'Debt recorded: Mounir owes 20,000 DZD.',
        alt: 'Orbit Telegram bot: user enters a debt for Mounir, enters 20000, and bot records 20,000 DZD owed.',
      },
    ],
    messageLabel: 'Example input',
    outputLabel: 'Organized in Orbit',
    demoNotice:
      'Actual Telegram screenshots, cropped and softly blurred to highlight the messages. This preview does not send anything.',
    demoCta: 'Create your free workspace',
    benefitLabel: 'Built around your day',
    benefitTitle: 'Make the important things easier to manage.',
    benefitIntro: 'One simple workspace for the everyday details that are easy to lose track of.',
    benefits: [
      {
        title: 'Know where your money goes',
        description: 'Record expenses and income so you can understand your money at a glance.',
      },
      {
        title: 'Keep your tasks moving',
        description: 'Manage your to-dos, priorities and goals without juggling different lists.',
      },
      {
        title: 'Remember what matters',
        description: 'Keep important commitments and reminders visible when you need them.',
      },
      {
        title: 'Stay clear on debts',
        description: 'See what you owe and what others owe you, in one organized view.',
      },
    ],
    stepsLabel: 'Getting started',
    stepsTitle: 'Simple from the very first day.',
    steps: [
      {
        title: 'Create a free account',
        description: 'Set up your Orbit workspace without a payment card.',
      },
      {
        title: 'Add your first item',
        description: 'Start with an expense, a task, a debt or a reminder.',
      },
      {
        title: 'See everything together',
        description: 'Return to your dashboard to review and organize your day.',
      },
    ],
    trustTitle: 'Start small. Keep control.',
    trustBody:
      'You can explore Orbit without paying. Connect Telegram later if you want quick entries from a messaging app. Some features depend on your selected plan.',
    trustLink: 'View available plans',
    faqLabel: 'Frequently asked questions',
    faqTitle: 'A few things you might be wondering.',
    faqs: [
      {
        question: 'Is Orbit free to use?',
        answer:
          'You can create an account and start on the free plan. Some features or sections may require an upgrade, depending on the current plan configuration.',
      },
      {
        question: 'Do I need Telegram?',
        answer:
          'No. Orbit has a web dashboard. Telegram is an optional way to capture supported items quickly from your phone.',
      },
      {
        question: 'Can I use Orbit on my phone?',
        answer: 'Yes. Orbit works in your mobile browser as well as on larger screens.',
      },
      {
        question: 'What can I organize with Orbit?',
        answer:
          'Tasks, reminders, goals, expenses, income, debts and other everyday information. Availability of individual features can vary by plan.',
      },
    ],
    finalTitle: 'Less to remember. More room to focus.',
    finalBody: 'Give your everyday tasks and money one simple home.',
    footerTagline: 'Keep your everyday life in order.',
    about: 'About',
    features: 'Features',
    pricing: 'Pricing',
    signIn: 'Sign in',
  },
  ar: {
    eyebrow: 'كل تفاصيل يومك، في مكان واحد',
    heroTop: 'مهامك، أموالك وتذكيراتك.',
    heroAccent: 'كلها في مكان واحد.',
    heroBody:
      'سجّل مصاريفك، تابع ديونك، نظّم مهامك ومتنساش مواعيدك. Orbit يساعدك تتابع كل شيء بسهولة.',
    explore: 'شوف كيفاش يخدم',
    reassurance: ['ابدأ مجانًا', 'مجانية مدى الحياة', 'تيليغرام اختياري'],
    previewCaption: 'معاينة توضيحية للوحة التحكم',
    floatingTitle: 'نظّم يومك براحة أكثر',
    floatingBody: 'بلا ما تبقى تقلب بين الملاحظات والتطبيقات.',
    sectionLabel: 'دردشة مع Orbit',
    demoTitle: 'ابعث رسالة، وOrbit ينظّمها.',
    demoIntro: 'محادثات حقيقية مع بوت Orbit في تيليغرام. اختار مثال.',
    chatBotName: 'Orbit Bot',
    chatBotSubtitle: 'محادثة توضيحية',
    chatTryLabel: 'اختار مثال',
    chatToday: 'اليوم',
    chatComposer: 'اختار مثال من الفوق',
    demoTabs: [
      {
        id: 'expense',
        label: 'مصروف',
        caption: 'تم تسجيل مصروف 1,500 دج — Flexy Ooredoo.',
        alt: 'محادثة في بوت Orbit على تيليغرام: تسجيل مصروف 1500 دج، Flexy Ooredoo.',
      },
      {
        id: 'task',
        label: 'مهمة',
        caption: 'تمت إضافة مهمة جلب السلعة من Port d’Alger.',
        alt: 'محادثة في بوت Orbit على تيليغرام: إضافة مهمة لجلب السلعة من Port d’Alger بأولوية متوسطة.',
      },
      {
        id: 'debt',
        label: 'دين',
        caption: 'تم تسجيل دين 20,000 دج مستحق عند Mounir.',
        alt: 'محادثة في بوت Orbit على تيليغرام: تسجيل دين مستحق عند Mounir بمبلغ 20000 دج.',
      },
    ],
    messageLabel: 'مثال على رسالة',
    outputLabel: 'منظّمة في Orbit',
    demoNotice:
      'صور من محادثات تيليغرام الفعلية، تم قصّ بعض الأجزاء وتمويهها للتركيز على الرسائل. هذه المعاينة لا ترسل أي شيء.',
    demoCta: 'أنشئ مساحتك مجانًا',
    benefitLabel: 'مصمّم ليومك',
    benefitTitle: 'كل التفاصيل المهمة، أسهل في التنظيم.',
    benefitIntro: 'مساحة واحدة للأمور اليومية اللي ساهل تتنسى أو تتخلط.',
    benefits: [
      {
        title: 'اعرف وين تروح دراهمك',
        description: 'سجّل مصاريفك ودخلك، وشوف وضعيتك المالية بوضوح.',
      },
      {
        title: 'نظّم المهام والأهداف',
        description: 'تابع واش لازم تدير والأولويات تاعك، بلا قوائم متفرّقة.',
      },
      {
        title: 'متنساش الأمور المهمة',
        description: 'خلي مواعيدك وتذكيراتك واضحة وفي متناولك.',
      },
      {
        title: 'تابع ديونك بلا تخلاط',
        description: 'اعرف شحال عليك وشحال عند الناس، في مكان واحد.',
      },
    ],
    stepsLabel: 'كيفاش تبدأ',
    stepsTitle: 'ساهل من أول استعمال.',
    steps: [
      { title: 'أنشئ حساب مجاني', description: 'افتح مساحتك الخاصة مجانية مدى الحياة.' },
      { title: 'أضف أول معلومة', description: 'ابدأ بمصروف، مهمة، دين أو تذكير.' },
      { title: 'شوف كل شيء منظّم', description: 'ارجع للوحة التحكم وتابع تفاصيل يومك بسهولة.' },
    ],
    trustTitle: 'ابدأ ببساطة، وتحكّم في اختيارك.',
    trustBody:
      'تقدر تبدأ مجانًا، وتربط تيليغرام لاحقًا إذا حبيت تضيف معلومات برسالة. بعض المزايا تعتمد على الخطة المختارة.',
    trustLink: 'شوف الاشتراكات المتاحة',
    faqLabel: 'أسئلة متكررة',
    faqTitle: 'كل ما تحتاج تعرفه قبل البداية.',
    faqs: [
      {
        question: 'هل Orbit مجاني؟',
        answer:
          'تقدر تنشئ حساب وتبدأ بالخطة المجانية. بعض الأقسام أو الميزات تحتاج ترقية حسب إعدادات الخطط الحالية.',
      },
      {
        question: 'هل لازم نستعمل تيليغرام؟',
        answer:
          'لا. تقدر تستعمل Orbit مباشرة من الموقع. تيليغرام اختيار إضافي لإدخال المعلومات المدعومة بسرعة من هاتفك.',
      },
      {
        question: 'نقدر نستعمل Orbit من الهاتف؟',
        answer: 'نعم، تقدر تستعمله من متصفح الهاتف أو الكمبيوتر.',
      },
      {
        question: 'واش نقدر ننظّم في Orbit؟',
        answer:
          'المهام، التذكيرات، الأهداف، المصاريف، المداخيل، الديون وغيرها. توفر بعض الميزات يختلف حسب الاشتراك.',
      },
    ],
    finalTitle: 'ما تبقاش كل حاجة في بلاصة.',
    finalBody: 'اجمع مهامك وأموالك وتذكيراتك في مساحة واحدة بسيطة.',
    footerTagline: 'يوم منظّم، بلا تعقيد.',
    about: 'حول Orbit',
    features: 'المزايا',
    pricing: 'الأسعار',
    signIn: 'تسجيل الدخول',
  },
};

const BENEFIT_ICONS = [WalletCards, ListTodo, BellRing, HandCoins];

function trackCTA(placement) {
  analytics.track(EVENTS.HOMEPAGE_CTA_CLICKED, { placement });
}

function StartButton({ label, placement, className = '' }) {
  return (
    <Link
      to="/register"
      className={`ol-button ol-button--primary ${className}`}
      onClick={() => trackCTA(placement)}
    >
      <span>{label}</span>
      <ArrowRight size={18} className="ol-rtl-flip" aria-hidden="true" />
    </Link>
  );
}

function Heading({ eyebrow, title, description, centered = false, id }) {
  return (
    <div className={`ol-section-heading ${centered ? 'ol-section-heading--center' : ''}`}>
      <p className="ol-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {description && <p className="ol-section-description pt-4">{description}</p>}
    </div>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.resolvedLanguage?.startsWith('ar');
  const copy = COPY[isArabic ? 'ar' : 'en'];
  const [activeExample, setActiveExample] = useState('expense');
  const example = copy.demoTabs.find(({ id }) => id === activeExample) || copy.demoTabs[0];

  return (
    <main className="orbit-landing" dir={isArabic ? 'rtl' : 'ltr'}>
      <section className="ol-hero" aria-labelledby="orbit-hero-title">
        <div className="ol-container ol-hero__grid">
          <div className="ol-hero__copy">
            <h1 id="orbit-hero-title">
              <span>{copy.heroTop}</span>
              <span className="ol-hero__accent">{copy.heroAccent}</span>
            </h1>
            <p className="ol-hero__description pt-5">{copy.heroBody}</p>
            <div className="ol-hero__actions">
              <StartButton label={t('marketing:startFree')} placement="hero" />
              <a
                className="ol-button ol-button--secondary"
                href="#orbit-demo"
                onClick={() =>
                  analytics.track(EVENTS.HOMEPAGE_DEMO_INTERACTION, { action: 'navigate' })
                }
              >
                <CirclePlay size={19} aria-hidden="true" />
                {copy.explore}
              </a>
            </div>
            <ul
              className="ol-reassurance pt-7"
              aria-label={isArabic ? 'مزايا البداية' : 'Getting started'}
            >
              {copy.reassurance.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="ol-hero__visual" aria-label={copy.previewCaption}>
            <div className="ol-hero__orb" aria-hidden="true" />
            <div className="ol-hero__ring" aria-hidden="true" />
            <div className="ol-hero__phone">
              <ProductPreview />
            </div>
          </div>
        </div>
      </section>

      <section
        className="ol-section ol-demo-section"
        id="orbit-demo"
        aria-labelledby="orbit-demo-title"
      >
        <div className="ol-container ol-demo-layout">
          <div className="ol-demo-copy">
            <StartButton
              label={t('marketing:startFree')}
              placement="demo"
              className="ol-demo-cta "
            />
          </div>

          <div className="ol-screenshot-demo">
            <div className="ol-demo-tabs" role="group" aria-label={copy.chatTryLabel}>
              {copy.demoTabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`ol-demo-tab ${activeExample === id ? 'is-active' : ''}`}
                  aria-pressed={activeExample === id}
                  onClick={() => {
                    if (activeExample !== id) {
                      setActiveExample(id);
                      analytics.track(EVENTS.HOMEPAGE_DEMO_INTERACTION, {
                        action: 'switch',
                        example: id,
                      });
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <figure className="ol-telegram-figure">
              <div className="ol-telegram-screen" aria-live="polite" aria-atomic="true">
                <img
                  key={activeExample}
                  src={TELEGRAM_SCREENSHOTS[activeExample]}
                  alt={example.alt}
                  width="710"
                  height="1070"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="ol-telegram-caption pt-3 px-2 font-bold font-mono">
                {example.caption}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="ol-section ol-benefits-section" aria-labelledby="orbit-benefits-title">
        <div className="ol-container">
          <Heading
            eyebrow={copy.benefitLabel}
            title={copy.benefitTitle}
            description={copy.benefitIntro}
            id="orbit-benefits-title"
            centered
          />
          <div className="ol-benefit-grid">
            {copy.benefits.map(({ title, description }, index) => {
              const Icon = BENEFIT_ICONS[index];
              return (
                <article className="ol-benefit-card" key={title}>
                  <span className="ol-benefit-icon">
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="ol-section ol-steps-section" aria-labelledby="orbit-steps-title">
        <div className="ol-container">
          <Heading
            eyebrow={copy.stepsLabel}
            title={copy.stepsTitle}
            id="orbit-steps-title"
            centered
          />
          <ol className="ol-steps-grid">
            {copy.steps.map(({ title, description }, index) => (
              <li key={title} className="ol-step">
                <span className="ol-step__number">{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ol-trust-section" aria-labelledby="orbit-trust-title">
        <div className="ol-container ol-trust-layout">
          <span className="ol-trust-icon">
            <ShieldCheck size={28} aria-hidden="true" />
          </span>
          <div>
            <h2 id="orbit-trust-title">{copy.trustTitle}</h2>
            <p>{copy.trustBody}</p>
          </div>
          <Link to="/pricing" className="ol-text-link">
            {copy.trustLink} <ArrowRight size={17} className="ol-rtl-flip" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="ol-section ol-faq-section" aria-labelledby="orbit-faq-title">
        <div className="ol-container ol-faq-layout">
          <Heading eyebrow={copy.faqLabel} title={copy.faqTitle} id="orbit-faq-title" />
          <div className="ol-faq-list">
            {copy.faqs.map(({ question, answer }, index) => (
              <details
                className="ol-faq"
                key={question}
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    analytics.track(EVENTS.HOMEPAGE_FAQ_OPENED, { faqIndex: index });
                  }
                }}
              >
                <summary>
                  {question}
                  <ChevronDown size={19} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ol-final-section" aria-labelledby="orbit-final-title">
        <div className="ol-container ol-final-inner">
          <div className="ol-final-glow" aria-hidden="true" />
          <h2 id="orbit-final-title">{copy.finalTitle}</h2>
          <p>{copy.finalBody}</p>
          <StartButton
            label={t('marketing:startFree')}
            placement="final"
            className="ol-final-button"
          />
          <span className="ol-final-reassurance">
            <CheckCircle2 size={17} aria-hidden="true" /> {copy.reassurance[1]}
          </span>
        </div>
      </section>

      <footer className="ol-footer">
        <div className="ol-container ol-footer-inner">
          <div className="ol-footer-brand">
            <img src="/logo-orbit.png" alt="" width="32" height="32" />
            <div>
              <strong>Orbit</strong>
              <small>{copy.footerTagline}</small>
            </div>
          </div>
          <nav aria-label={isArabic ? 'روابط إضافية' : 'Additional links'}>
            <Link to="/features">{copy.features}</Link>
            <Link to="/pricing">{copy.pricing}</Link>
            <Link to="/about">{copy.about}</Link>
            <Link to="/login">{copy.signIn}</Link>
          </nav>
          <small>© {new Date().getFullYear()} Orbit</small>
        </div>
      </footer>
    </main>
  );
}
