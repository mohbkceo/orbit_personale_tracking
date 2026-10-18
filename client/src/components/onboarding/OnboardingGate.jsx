import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { OnboardingExperience } from './OnboardingExperience.jsx';

export function OnboardingGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [opened, setOpened] = useState(false);
  const [loadedForManual, setLoadedForManual] = useState(null);
  const [error, setError] = useState('');
  const manual = new URLSearchParams(location.search).get('onboarding') === '1';

  useEffect(() => {
    let active = true;
    setError('');
    api.get('/me/onboarding', manual ? { params: { details: '1' } } : undefined).then((response) => {
      if (active) { setState(response.data); setOpened(response.data.autoPresent === true); setLoadedForManual(manual); }
    }).catch((failure) => {
      if (active) { setError(failure.message); setLoadedForManual(manual); }
    });
    return () => { active = false; };
  }, [manual]);

  const exit = () => { setOpened(false); navigate('/panel', { replace: true }); };
  const update = async (status, step, resume = false) => {
    const response = await api.patch('/me/onboarding', { status, ...(step ? { step } : {}), ...(resume ? { resume: true } : {}) });
    setState((current) => ({ ...current, ...response.data }));
    return response.data;
  };

  if (loadedForManual !== manual) return null;
  if (!state && !manual) return null;
  if (!manual && !opened) return null;
  if (error) return manual ? <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-lift" role="alert"><p className="text-sm">Could not open Getting Started: {error}</p><button type="button" className="btn-secondary mt-3" onClick={exit}>Return to dashboard</button></div> : null;
  if (!state) return null;
  return <OnboardingExperience state={state} update={update} onExit={exit} />;
}
