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

const menu = [
  ['Home', LayoutList],
  ['Tasks', CalendarCheck2],
  ['Goals', Goal],
  ['Expenses', CircleDollarSign],
  ['Debts', Landmark],
  ['Reminders', Bell],
];
const tasks = ['Review weekly priorities', 'Plan next project step', 'Check monthly expenses'];

export function ProductPreview() {
  return (
    <div
      className="marketing-preview"
      role="img"
      aria-label="Preview of the Orbit dashboard showing tasks, goals, expenses and reminders"
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
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="marketing-preview-settings">
          <Settings size={14} /> Settings
        </div>
      </aside>
      <div className="marketing-preview-main">
        <div className="marketing-preview-top">
          <Menu size={15} className="marketing-preview-menu-icon" />
          <div className="marketing-preview-search">
            <Search size={14} />
            Search anything...
          </div>
          <Bell size={15} />
          <span className="marketing-preview-avatar">A</span>
        </div>
        <div className="marketing-preview-content">
          <div className="marketing-preview-greeting">
            <div>
              <strong>
                Good morning, Alex <span>☀</span>
              </strong>
              <small>Here is your day at a glance.</small>
            </div>
            <small>Today</small>
          </div>
          <div className="marketing-preview-stats">
            <div>
              <span className="orange">
                <Check size={16} />
              </span>
              <strong>12</strong>
              <small>Tasks</small>
              <em>5 due today</em>
            </div>
            <div>
              <span className="green">
                <Goal size={16} />
              </span>
              <strong>3</strong>
              <small>Goals</small>
              <em>2 on track</em>
            </div>
            <div>
              <span className="blue">
                <CircleDollarSign size={16} />
              </span>
              <strong>$892</strong>
              <small>Expenses</small>
              <em>This month</em>
            </div>
            <div>
              <span className="orange">
                <Landmark size={16} />
              </span>
              <strong>$1,200</strong>
              <small>Debt</small>
              <em>Across 2 accounts</em>
            </div>
          </div>
          <div className="marketing-preview-grid">
            <section>
              <h3>
                Tasks <span>View all →</span>
              </h3>
              {tasks.map((task, i) => (
                <div className="marketing-preview-task" key={task}>
                  <span className={i === 0 ? 'done' : ''}>{i === 0 && <Check size={10} />}</span>
                  <p>{task}</p>
                  <small>{i === 2 ? 'Tomorrow' : 'Today'}</small>
                </div>
              ))}
            </section>
            <section>
              <h3>
                Goals <span>View all →</span>
              </h3>
              {[
                ['Build a savings habit', 68],
                ['Read more this year', 40],
                ['Move every day', 25],
              ].map(([label, amount]) => (
                <div className="marketing-preview-goal" key={label}>
                  <p>{label}</p>
                  <div>
                    <span style={{ width: `${amount}%` }} />
                  </div>
                </div>
              ))}
            </section>
            <section>
              <h3>
                Expenses <span>View all →</span>
              </h3>
              {[
                ['Food & Dining', '$320'],
                ['Shopping', '$210'],
                ['Bills & Utilities', '$180'],
              ].map(([label, amount]) => (
                <div className="marketing-preview-row" key={label}>
                  <span>{label}</span>
                  <b>{amount}</b>
                </div>
              ))}
            </section>
            <section>
              <h3>
                Reminders <span>View all →</span>
              </h3>
              {[
                ['Pay utility bill', 'Today'],
                ['Take vitamins', 'Today'],
                ['Call Mom', 'Tomorrow'],
              ].map(([label, when]) => (
                <div className="marketing-preview-row" key={label}>
                  <span>{label}</span>
                  <b>{when}</b>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
