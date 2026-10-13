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

export default function Landing() {
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
            <Link
              to="/pricing"
              className="marketing-button marketing-button-primary marketing-hero-primary"
            >
              Get Started <ArrowRight size={19} />
            </Link>
            <button
              type="button"
              className="marketing-button marketing-button-outline"
              onClick={() => setDemoOpen(true)}
            >
              <CirclePlay size={23} /> Explore Orbit
            </button>
          </div>
          <p className="mt-4 text-sm"><Link className="underline" to="/register">Create an account</Link> · <Link className="underline" to="/login">Already a member? Sign in</Link></p>
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
            <h2 id="demo-title">One place for your everyday plans</h2>
            <ol className="mt-4 space-y-4"><li><strong>1. Plan your day.</strong> Capture tasks, set priorities and see what needs your attention.</li><li><strong>2. Understand your money.</strong> Keep expenses, accounts, debts and savings goals together.</li><li><strong>3. Stay on track.</strong> Connect Telegram for reminders and quick updates.</li></ol>
            <Link to="/pricing" className="marketing-button marketing-button-primary mt-6">Choose your Orbit plan <ArrowRight size={18} /></Link>
          </section>
        </div>
      )}
    </main>
  );
}
