import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  Check,
  CirclePlay,
  UsersRound,
  X,
} from 'lucide-react';
import { ProductPreview } from './ProductPreview.jsx';

export default function Landing() {
  const { openGetStarted } = useOutletContext();
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
          <span className="marketing-hero-pill">A more organized you</span>
          <h1>
            Organize your work.
            <br />
            <span>Track your life.</span>
          </h1>
          <p>
            Bring your tasks, goals, expenses, debts, and reminders into one simple, beautiful space
            — so you can focus on what matters most.
          </p>
          <div className="marketing-hero-actions">
            <button
              type="button"
              className="marketing-button marketing-button-primary marketing-hero-primary"
              onClick={openGetStarted}
            >
              Get Started <ArrowRight size={19} />
            </button>
            <button
              type="button"
              className="marketing-button marketing-button-outline"
              onClick={() => setDemoOpen(true)}
            >
              <CirclePlay size={23} /> Watch Demo
            </button>
          </div>
          <div className="marketing-values">
            <div>
              <span>
                <Check size={20} />
              </span>
              All-in-one
              <br />
              organization
            </div>
            <div>
              <span>
                <ChartNoAxesColumnIncreasing size={20} />
              </span>
              Built for
              <br />
              real life
            </div>
            <div>
              <span>
                <UsersRound size={20} />
              </span>
              Simple,
              <br />
              flexible, powerful
            </div>
          </div>
        </div>
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
              aria-label="Close"
              onClick={() => setDemoOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="marketing-eyebrow">Orbit demo</span>
            <h2 id="demo-title">A closer look is coming soon</h2>
            <p>
              We are preparing a short walkthrough of the Orbit workspace. In the meantime, explore
              the features page to see what it can do.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
