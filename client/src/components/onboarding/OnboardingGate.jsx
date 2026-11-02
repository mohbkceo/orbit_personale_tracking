import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.js';
import { Spinner } from '../ui.jsx';
import { OnboardingExperience } from './OnboardingExperience.jsx';

export function OnboardingGate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api
      .get('/me/onboarding')
      .then((response) => {
        if (live) setState(response.data);
      })
      .catch((failure) => {
        if (live) setError(failure.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (
      state &&
      (state.enabled === false ||
        (params.get('auto') === '1' && state.status === 'NOT_STARTED' && !state.autoPresent))
    )
      navigate('/subscribe', { replace: true });
  }, [state, params, navigate]);
  const submit = useCallback(async (input) => {
    const response = await api.patch('/me/onboarding/responses', input);
    setState(response.data);
    return response.data;
  }, []);
  async function update(status, step, resume = false) {
    const response = await api.patch('/me/onboarding', {
      status,
      ...(step ? { step } : {}),
      ...(resume ? { resume: true } : {}),
    });
    setState(response.data);
    return response.data;
  }
  if (error)
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-5">
        <div className="panel max-w-md p-6">
          <p role="alert">{error}</p>
          <a className="btn-primary mt-4" href="/subscribe">
            {t('onboarding:flow.continuePlans')}
          </a>
        </div>
      </main>
    );
  if (!state) return <Spinner />;
  if (
    state.enabled === false ||
    (params.get('auto') === '1' && state.status === 'NOT_STARTED' && !state.autoPresent)
  )
    return <Spinner />;
  return (
    <OnboardingExperience
      state={state}
      update={update}
      submit={state.flow ? submit : undefined}
      onExit={() => navigate('/subscribe', { replace: true })}
    />
  );
}
