import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bell, ClipboardCheck, Goal, Send, WalletCards } from 'lucide-react';
import { useTelegram } from '../../context/TelegramContext.js';

const steps = ['welcome', 'first-action', 'telegram'];

function WelcomeVisual() {
  return <div className="relative mx-auto grid h-44 w-full max-w-[280px] place-items-center" aria-hidden="true">
    <div className="absolute h-40 w-40 rounded-full border border-primary/20 bg-selected" />
    <div className="absolute h-28 w-28 rounded-full border border-primary/20 bg-surface" />
    <img src="/logo-orbit.png" alt="" className="relative h-20 w-20 object-contain" />
    <ClipboardCheck className="absolute left-4 top-4 text-primary" size={27} />
    <WalletCards className="absolute bottom-4 right-4 text-primary" size={27} />
  </div>;
}

export function OnboardingExperience({ state, update, onExit }) {
  const { t } = useTranslation();
  const telegram = useTelegram();
  const setTelegramWatching = telegram.setWatching;
  const [step, setStep] = useState(() => state.status === 'IN_PROGRESS' && steps.includes(state.step) ? state.step : 'welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const heading = useRef(null);
  const index = steps.indexOf(step);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (step === 'telegram') setTelegramWatching?.(true);
    return () => setTelegramWatching?.(false);
  }, [step, setTelegramWatching]);

  async function act(status, nextStep) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await update(status, nextStep, state.status === 'SKIPPED' && status === 'IN_PROGRESS');
      if (nextStep) setStep(nextStep);
      else onExit();
    } catch (failure) {
      setError(failure.message || t('onboarding:flow.saveError'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <main className="flex min-h-dvh flex-col bg-canvas text-text">
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
      <span className="inline-flex items-center gap-2 font-display text-xl font-bold"><img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />Orbit</span>
      <span className="text-sm font-semibold text-muted">{index + 1} / {steps.length}</span>
    </header>
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-7 pt-3 text-center sm:py-10">
      {step === 'welcome' && <WelcomeVisual />}
      {step === 'first-action' && <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-3">
        {[[ClipboardCheck, 'tasksBenefit'], [WalletCards, 'moneyBenefit'], [Goal, 'goalsBenefit'], [Bell, 'remindersBenefit']].map(([Icon, key]) => <div key={key} className="panel flex min-h-28 flex-col items-center justify-center gap-2 p-3 text-center"><Icon size={29} className="text-primary" aria-hidden="true" /><span className="text-sm font-semibold">{t(`onboarding:flow.${key}`)}</span></div>)}
      </div>}
      {step === 'telegram' && <div className="mx-auto grid h-40 w-40 place-items-center rounded-[2rem] border border-primary/20 bg-selected text-primary" aria-hidden="true"><Send size={64} /></div>}
      <h1 ref={heading} tabIndex={-1} className="mt-7 font-display text-[clamp(2rem,8vw,3rem)] font-bold leading-tight outline-none">{t(`onboarding:flow.${step}Title`)}</h1>
      <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted">{t(`onboarding:flow.${step}Description`)}</p>
      {step === 'telegram' && <div className="mx-auto mt-6 w-full max-w-sm">
        {telegram.status?.connected ? <p role="status" className="rounded-xl bg-success/10 p-3 font-semibold text-success">{t('onboarding:flow.telegramConnected')}</p> : <button type="button" onClick={telegram.connect} disabled={busy || telegram.busy || telegram.loading || !telegram.status?.botUrl} className="btn-secondary min-h-12 w-full justify-center">{telegram.busy ? t('onboarding:flow.connecting') : t('onboarding:flow.connectTelegram')}</button>}
        {telegram.error && <p role="alert" className="mt-3 text-sm text-danger">{telegram.error}</p>}
        {!telegram.loading && !telegram.status?.botUrl && !telegram.status?.connected && <p className="mt-3 text-sm text-muted">{t('onboarding:flow.telegramLater')}</p>}
      </div>}
      {error && <div role="alert" className="mx-auto mt-6 w-full max-w-md rounded-xl bg-danger/10 p-3 text-sm text-danger"><p>{error}</p><a href="/subscribe" className="mt-2 inline-block font-semibold underline">{t('onboarding:flow.continuePlans')}</a></div>}
    </div>
    <div className="sticky bottom-0 border-t border-border bg-surface/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
      <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
        <button type="button" disabled={busy || telegram.busy} onClick={() => act('SKIPPED')} className="btn-secondary min-h-12 w-full justify-center text-base">{t('onboarding:flow.skip')}</button>
        <button type="button" disabled={busy || telegram.busy} onClick={() => index === steps.length - 1 ? act('COMPLETED') : act('IN_PROGRESS', steps[index + 1])} className="btn-primary min-h-12 w-full justify-center text-base">{busy ? t('common:saving') : t('onboarding:flow.next')} <ArrowRight className="rtl-flip" size={18} /></button>
      </div>
    </div>
  </main>;
}
