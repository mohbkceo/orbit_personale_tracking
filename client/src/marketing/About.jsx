import { ArrowRight, Check } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export default function About() {
  const { openGetStarted } = useOutletContext();
  return (
    <main className="marketing-page marketing-about">
      <div className="marketing-page-intro">
        <span className="marketing-eyebrow">About Orbit</span>
        <h1>One calm place for the moving parts of life.</h1>
        <p>
          Orbit is a personal operating system for the things you manage every day: tasks, goals,
          money, reminders and plans.
        </p>
      </div>
      <div className="marketing-about-grid">
        <section>
          <h2>Less scattered. More in control.</h2>
          <p>
            Important details are easy to lose when they live in different places. Orbit brings them
            into one workspace so you can see what needs attention and keep moving.
          </p>
          <button
            type="button"
            className="marketing-button marketing-button-primary"
            onClick={openGetStarted}
          >
            Get Started <ArrowRight size={18} />
          </button>
        </section>
        <div className="marketing-about-list">
          {[
            'Know what is next',
            'Make progress on goals',
            'Understand your money',
            'Remember what matters',
          ].map((item) => (
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
