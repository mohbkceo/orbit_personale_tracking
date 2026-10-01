import { useEffect, useState } from 'react';
import { ArrowUpRight, CreditCard, MessageCircle, X } from 'lucide-react';
import { api } from '../api/client.js';
import { whatsappUrl } from './whatsapp.js';
import { analytics } from '../analytics/client.js';

export function GetStartedModal({ open, onClose }) {
  const [sales, setSales] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setLoading(true);
    setError('');
    setSales(null);
    api
      .get('/public/config')
      .then((result) => {
        if (live) setSales(result.data?.sales || null);
      })
      .catch(() => {
        if (live) setError('Contact options are unavailable right now. Please try again later.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  const url = whatsappUrl(sales);
  const available = Boolean(url);
  const contact = () => {
    if (!available) return;
    const popup = window.open('about:blank', '_blank');
    void analytics.createLead().then((lead) => {
      const destination = whatsappUrl(sales, lead?.leadCode) || url;
      if (popup) { popup.opener = null; popup.location.replace(destination); }
      else window.location.assign(destination);
    });
  };
  return (
    <div
      className="marketing-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-started-title"
        className="marketing-modal"
      >
        <button
          type="button"
          autoFocus
          className="marketing-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="marketing-eyebrow">Start your Orbit</span>
        <h2 id="get-started-title">Get started with Orbit</h2>
        <p>Choose how you would like to arrange access to your workspace.</p>
        <div className="marketing-choice-list">
          <button
            type="button"
            disabled={loading || !available}
            onClick={contact}
            className="marketing-choice"
          >
            <span className="marketing-choice-icon">
              <MessageCircle size={21} />
            </span>
            <span>
              <strong>Contact us — COD</strong>
              <small>
                {loading
                  ? 'Checking availability…'
                  : available
                    ? 'Chat with us on WhatsApp'
                    : 'Unavailable for now'}
              </small>
            </span>
            <ArrowUpRight size={19} />
          </button>
          <button type="button" disabled className="marketing-choice">
            <span className="marketing-choice-icon">
              <CreditCard size={21} />
            </span>
            <span>
              <strong>Pay online</strong>
              <small>Coming soon</small>
            </span>
          </button>
        </div>
        {error && (
          <p className="marketing-modal-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
