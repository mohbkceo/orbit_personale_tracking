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
import { useOutletContext } from 'react-router-dom';

const groups = [
  {
    title: 'Organize',
    icon: CalendarCheck2,
    description: 'Keep everyday work and longer plans together.',
    items: [
      ['Tasks', 'Plan work and track what is done.'],
      ['Goals', 'Follow progress toward what matters.'],
      ['Projects', 'Keep related work in one place.'],
      ['Daily Focus', 'Choose what deserves attention today.'],
    ],
  },
  {
    title: 'Money',
    icon: WalletCards,
    description: 'See your finances with less friction.',
    items: [
      ['Accounts and transactions', 'Follow balances and money movement.'],
      ['Expenses and income', 'Record what goes out and comes in.'],
      ['Debts', 'Track what you owe or are owed.'],
      ['Bills and subscriptions', 'Keep recurring commitments visible.'],
    ],
  },
  {
    title: 'Remember',
    icon: Bell,
    description: 'Stay ahead of important dates and follow-ups.',
    items: [
      ['Reminders', 'Set reminders for personal and planned items.'],
      ['Smart follow-ups', 'Keep unfinished items from slipping away.'],
      ['Scheduled summaries', 'Review what is coming up.'],
    ],
  },
  {
    title: 'Capture quickly',
    icon: Sparkles,
    description: 'Get an idea into Orbit while it is fresh.',
    items: [
      ['Quick Add', 'Create a task, expense or income entry fast.'],
      ['Search', 'Find what you need across your workspace.'],
      ['Telegram quick entry', 'Capture supported items through Orbit on Telegram.'],
      ['Notes', 'Keep useful details close.'],
    ],
  },
];

export default function Features() {
  const { openGetStarted } = useOutletContext();
  return (
    <main className="marketing-page">
      <div className="marketing-page-intro">
        <span className="marketing-eyebrow">Orbit features</span>
        <h1>Everything you need to stay on top of your life.</h1>
        <p>
          From today’s tasks to your longer goals and everyday money, Orbit brings the essentials
          into one organized workspace.
        </p>
        <button
          type="button"
          className="marketing-button marketing-button-primary"
          onClick={openGetStarted}
        >
          Get Started <ArrowRight size={18} />
        </button>
      </div>
      <div className="marketing-feature-grid">
        {groups.map(({ title, icon: Icon, description, items }) => (
          <section className="marketing-feature-card" key={title}>
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
          </section>
        ))}
      </div>
      <div className="marketing-feature-note">
        <Goal size={20} />
        <span>Make progress visible.</span>
        <CircleDollarSign size={20} />
        <span>Keep money clear.</span>
        <Landmark size={20} />
        <span>Remember commitments.</span>
        <Search size={20} />
        <span>Find it quickly.</span>
        <Send size={20} />
        <span>Capture on the go.</span>
      </div>
    </main>
  );
}
