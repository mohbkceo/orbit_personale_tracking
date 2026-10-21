import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Send, WalletCards, X } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useApp } from '../../context/useApp.js';
import { useCapabilities } from '../../context/CapabilitiesContext.js';
import { useTelegram } from '../../context/TelegramContext.js';
import { formatNumber } from '../../utils/format.js';

const steps = ['welcome', 'first-action', 'telegram', 'finish'];

function OrbitMark() {
  return <span className="inline-flex items-center gap-2.5 font-display text-lg font-bold"><img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />Orbit</span>;
}

function WelcomeVisual() {
  const { t: _t } = useTranslation();
  return <div className="relative mx-auto grid h-48 w-full max-w-[330px] place-items-center sm:h-56" aria-hidden="true">
    <div className="absolute h-44 w-44 rounded-full border border-primary/15 bg-selected shadow-[0_22px_70px_rgb(var(--color-primary)/.10)] sm:h-52 sm:w-52" />
    <div className="absolute h-32 w-32 rounded-full border border-primary/20 bg-surface sm:h-40 sm:w-40" />
    <div className="relative grid h-20 w-20 place-items-center rounded-[25px] bg-surface shadow-lift"><img src="/logo-orbit.png" alt="" className="h-14 w-14 object-contain" /></div>
    <div className="absolute left-0 top-4 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold shadow-lift"><ClipboardCheck size={17} className="text-primary" />{' '}{_t('navigation:tasks')}</div>
    <div className="absolute bottom-3 right-0 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold shadow-lift"><WalletCards size={17} className="text-primary" />{' '}{_t('navigation:money')}</div>
  </div>;
}

function SelectionCard({ selected, icon: Icon, title, description, onClick }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-start transition-colors sm:p-5 ${selected ? 'border-primary bg-selected' : 'border-border bg-surface hover:border-primary/50'}`}>
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-selected text-primary"><Icon size={22} /></span>
    <span className="min-w-0 flex-1"><strong className="block font-display text-base">{title}</strong><span className="mt-1 block text-sm text-muted">{description}</span></span>
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-text' : 'border-border'}`}>{selected && <Check size={13} />}</span>
  </button>;
}

export function OnboardingExperience({ state, update, onExit }) {
  const { t: _t } = useTranslation();
  const { settings } = useApp();
  const capabilities = useCapabilities();
  const telegram = useTelegram();
  const setTelegramWatching = telegram.setWatching;
  const [step, setStep] = useState(() => state.status === 'IN_PROGRESS' ? state.step : state.status === 'COMPLETED' ? 'finish' : 'welcome');
  const [actions, setActions] = useState(state.actions || { task: false, account: false });
  const [selection, setSelection] = useState('');
  const [task, setTask] = useState({ title: '', dueDate: '', priority: 'medium' });
  const [wallet, setWallet] = useState({ name: '', type: 'bank', currency: settings.defaultCurrency || 'DZD', openingBalance: '0' });
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => { if (!currencyEdited) setWallet((current) => ({ ...current, currency: settings.defaultCurrency || 'DZD' })); }, [settings.defaultCurrency, currencyEdited]);
  useEffect(() => { if (step === 'telegram') setTelegramWatching?.(true); return () => setTelegramWatching?.(false); }, [step, setTelegramWatching]);
  useEffect(() => {
    const previous = document.activeElement;
    const panel = document.querySelector('[data-orbit-panel-root]');
    if (panel) panel.inert = true;
    closeRef.current?.focus();
    return () => {
      if (panel) panel.inert = false;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else window.setTimeout(() => document.querySelector('[data-orbit-panel-root] h1')?.focus?.(), 0);
    };
  }, []);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  async function progress(next) {
    setBusy(true); setError('');
    try { await update('IN_PROGRESS', next, ...(state.status === 'SKIPPED' ? [true] : [])); setStep(next); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function dismiss() {
    setBusy(true); setError('');
    try { if (state.status !== 'COMPLETED') await update('SKIPPED'); onExit(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function complete() {
    setBusy(true); setError('');
    try { await update('COMPLETED'); onExit(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function saveAction(event) {
    event.preventDefault();
    if (!selection || busy) return;
    setBusy(true); setError('');
    try {
      if (selection === 'task') {
        await endpoints.create('tasks', { title: task.title.trim(), priority: task.priority, ...(task.dueDate ? { dueDate: task.dueDate } : {}) });
        setActions((current) => ({ ...current, task: true }));
      } else {
        await endpoints.create('accounts', { name: wallet.name.trim(), type: wallet.type, currency: wallet.currency.trim().toUpperCase(), openingBalance: Number(wallet.openingBalance || 0) });
        setActions((current) => ({ ...current, account: true }));
      }
      window.dispatchEvent(new Event('orbit:capabilities-changed'));
    } catch (failure) {
      setError(failure.message);
      void capabilities.refresh();
    } finally { setBusy(false); }
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); void dismiss(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')].filter((node) => node.getClientRects().length);
    if (!nodes.length) return;
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
  }

  const taskDecision = capabilities.decision('tasks');
  const accountDecision = capabilities.decision('accounts');
  const taskLimit = capabilities.decision('active-tasks-limit');
  const accountLimit = capabilities.decision('accounts-limit');
  const canTask = taskDecision?.allowed === true && (taskLimit?.remaining == null || taskLimit.remaining > 0) && (taskDecision.remaining == null || taskDecision.remaining > 0);
  const canAccount = accountDecision?.allowed === true && (accountLimit?.remaining == null || accountLimit.remaining > 0);
  const linked = telegram.status?.connected === true;
  const linkExpired = telegram.link?.expiresAt && new Date(telegram.link.expiresAt).getTime() <= Date.now();
  const index = steps.indexOf(step);

  return <div className="onboarding-canvas fixed inset-0 z-[60] overflow-hidden text-text" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onKeyDown={onKeyDown}>
    <div className="mx-auto flex h-full w-full max-w-[760px] flex-col border-x-0 border-primary/10 bg-surface/85 shadow-[0_12px_80px_rgb(var(--color-text)/.07)] sm:border-x">
      <header className="shrink-0 px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-10 sm:pt-7">
        <div className="flex items-center justify-between gap-3"><OrbitMark /><div className="flex items-center gap-1"><button type="button" className="rounded-lg px-2 py-2 text-xs font-semibold text-muted hover:text-primary" onClick={dismiss}>{_t('onboarding:ui.skipForNow')}</button><button ref={closeRef} type="button" aria-label={_t('onboarding:ui.closeOnboarding')} className="icon-btn" onClick={dismiss}><X size={20} /></button></div></div>
        <div className="mt-5 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-valuetext={_t('onboarding:stepProgress', { current: formatNumber(index + 1), total: formatNumber(steps.length), label: _t(`onboarding:steps.${step}`) })} aria-label={_t('onboarding:ui.onboardingProgress')}>{steps.map((item, position) => <span key={item} className={`h-1.5 flex-1 rounded-full ${position <= index ? 'bg-primary' : 'bg-primary/15'}`} />)}</div>
        <p className="mt-2 text-xs font-semibold text-primary" aria-live="polite">{_t('onboarding:stepProgress', { current: formatNumber(index + 1), total: formatNumber(steps.length), label: _t(`onboarding:steps.${step}`) })}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-10 sm:py-8">
        {step === 'welcome' && <div className="flex min-h-full flex-col items-center justify-center text-center"><WelcomeVisual /><div className="mt-4 max-w-lg"><h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="font-display text-[clamp(2.1rem,7vw,3.5rem)] font-bold leading-[1.08] tracking-tight">{_t('onboarding:ui.welcomeToOrbit')}</h1><p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">{_t('onboarding:ui.yourSpaceToOrganizeTasksMoneyGoalsAndEverythingThatMatters')}</p><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{_t('onboarding:ui.getStartedInAFewSimpleStepsOrExploreOrbitOnYourOwn')}</p></div></div>}

        {step === 'first-action' && <div className="mx-auto max-w-xl"><h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="font-display text-[clamp(1.8rem,5vw,2.7rem)] font-bold leading-tight tracking-tight">{_t('onboarding:ui.letsStartWithSomethingSimple')}</h1><p className="mt-3 text-sm text-muted sm:text-base">{_t('onboarding:ui.chooseWhatYouWouldLikeToOrganizeFirst')}</p>
          {actions.task || actions.account ? <div className="mt-8 rounded-2xl border border-success/30 bg-success/10 p-5" role="status"><CheckCircle2 size={26} className="text-success" /><h2 className="mt-3 font-display text-lg font-bold">{_t('onboarding:ui.youreAlreadyUnderway')}</h2><p className="mt-1 text-sm text-muted">{actions.task && actions.account ? _t('onboarding:ui.youAlreadyHaveATaskAndAnAccountInOrbit') : actions.task ? _t('onboarding:ui.yourFirstTaskIsInOrbit') : _t('onboarding:ui.yourFirstWalletIsInOrbit')}{' '}{_t('onboarding:ui.youCanContinueWithoutCreatingAnother')}</p></div> : capabilities.loading ? <p className="mt-8 text-sm text-muted" role="status">{_t('onboarding:ui.checkingAvailableFeatures')}</p> : <>
            <div className="mt-7 grid gap-3">{canTask && <SelectionCard selected={selection === 'task'} icon={ClipboardCheck} title={_t('onboarding:ui.createMyFirstTask')} description={_t('onboarding:ui.writeDownSomethingYouWantToGetDone')} onClick={() => { setSelection('task'); setError(''); }} />}{canAccount && <SelectionCard selected={selection === 'account'} icon={WalletCards} title={_t('onboarding:ui.setUpMyWallet')} description={_t('onboarding:ui.startTrackingYourMoneyInOnePlace')} onClick={() => { setSelection('account'); setError(''); }} />}{!canTask && !canAccount && <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">{_t('onboarding:ui.noFirstActionIsAvailableWithYourCurrentWorkspaceSettingsYouCanCo')}</p>}</div>
            {selection && <form id="onboarding-action-form" onSubmit={saveAction} className="mt-5 space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
              {selection === 'task' ? <><h2 className="font-display text-lg font-bold">{_t('onboarding:ui.yourFirstTask')}</h2><label className="block"><span className="label">{_t('onboarding:ui.taskTitle')}</span><input className="field" required maxLength={180} value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder={_t('onboarding:ui.eGPlanMyWeek')} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="label">{_t('onboarding:ui.dueDateOptional')}</span><input className="field" type="date" value={task.dueDate} onChange={(event) => setTask({ ...task, dueDate: event.target.value })} /></label><label className="block"><span className="label">{_t('onboarding:ui.priorityOptional')}</span><select className="field" value={task.priority} onChange={(event) => setTask({ ...task, priority: event.target.value })}><option value="low">{_t('onboarding:ui.low')}</option><option value="medium">{_t('onboarding:ui.medium')}</option><option value="high">{_t('onboarding:ui.high')}</option><option value="urgent">{_t('onboarding:ui.urgent')}</option></select></label></div></> : <><h2 className="font-display text-lg font-bold">{_t('onboarding:ui.yourFirstWallet')}</h2><label className="block"><span className="label">{_t('onboarding:ui.walletOrAccountName')}</span><input className="field" required maxLength={80} value={wallet.name} onChange={(event) => setWallet({ ...wallet, name: event.target.value })} placeholder={_t('onboarding:ui.eGMainAccount')} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="label">{_t('onboarding:ui.accountType')}</span><select className="field" value={wallet.type} onChange={(event) => setWallet({ ...wallet, type: event.target.value })}><option value="bank">{_t('onboarding:ui.bank')}</option><option value="cash">{_t('onboarding:ui.cash')}</option><option value="savings">{_t('onboarding:ui.savings')}</option><option value="wallet">{_t('onboarding:ui.wallet')}</option><option value="other">{_t('onboarding:ui.other')}</option></select></label><label className="block"><span className="label">{_t('onboarding:ui.currency')}</span><input className="field uppercase" required minLength={3} maxLength={3} value={wallet.currency} onChange={(event) => { setCurrencyEdited(true); setWallet({ ...wallet, currency: event.target.value }); }} /></label></div><label className="block"><span className="label">{_t('onboarding:ui.openingBalanceOptional')}</span><input className="field" type="number" step="0.01" value={wallet.openingBalance} onChange={(event) => setWallet({ ...wallet, openingBalance: event.target.value })} /></label></>}
            </form>}
          </>}
        </div>}

        {step === 'telegram' && <div className="mx-auto max-w-xl"><h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="font-display text-[clamp(1.8rem,5vw,2.7rem)] font-bold leading-tight tracking-tight">{_t('onboarding:ui.makeOrbitEvenEasierWithTelegram')}</h1><p className="mt-3 text-sm text-muted sm:text-base">{_t('onboarding:ui.sendSimpleMessagesFromYourPhoneAndLetOrbitOrganizeThem')}</p><p className="mt-3 text-sm text-muted">{_t('onboarding:ui.telegramIsAFreeMessagingAppSimilarToWhatsapp')}</p>
          <div className="mt-7 space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-label={_t('onboarding:ui.exampleTelegramConversation')}><div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-text">{_t('onboarding:ui.tCallAhmedTomorrow')}</p></div><div className="flex justify-start"><p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-alt px-4 py-3 text-sm"><strong className="block text-xs text-primary">Orbit</strong>{_t('onboarding:ui.taskAdded')}<br />{_t('onboarding:ui.callAhmedDueTomorrow')}</p></div></div><p className="mt-3 text-xs text-muted">{_t('onboarding:ui.thisExampleUsesOrbitsTaskCommandTheAssistantFollowsYourCurrentFe')}</p>
          {linked ? <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-4" role="status"><div className="flex items-start gap-3"><CheckCircle2 size={22} className="shrink-0 text-success" /><div><p className="font-semibold">{_t('onboarding:ui.telegramConnected')}{telegram.status.telegramUsername ? _t('common:dynamic.asUsername', { username: telegram.status.telegramUsername }) : ''}</p><p className="mt-1 text-sm text-muted">{_t('onboarding:ui.youreReadyToMessageOrbit')}</p>{telegram.status.botUrl && <a className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline" href={telegram.status.botUrl} target="_blank" rel="noopener noreferrer">{_t('onboarding:ui.openTheBot')}{' '}<ArrowRight className="rtl-flip" size={15} /></a>}</div></div></div> : <div className="mt-6 space-y-3"><button type="button" className="btn-primary w-full justify-center sm:w-auto" onClick={telegram.connect} disabled={telegram.busy || !telegram.status?.botUrl}><Send size={17} />{telegram.busy ? _t('onboarding:ui.preparingConnection') : telegram.link ? _t('onboarding:ui.generateANewLink') : _t('onboarding:ui.connectTelegram')}</button>{!telegram.loading && !telegram.status?.botUrl && <p className="text-sm text-muted">{_t('onboarding:ui.telegramConnectionIsNotConfiguredRightNowYouCanSetItUpLater')}</p>}{telegram.link && <div className="rounded-xl border border-border bg-surface-alt p-4 text-sm" role="status"><p>{linkExpired ? _t('onboarding:ui.thisConnectionLinkExpiredGenerateANewLinkToTryAgain') : _t('onboarding:ui.waitingForYouToConfirmTheConnectionInTelegramOrbitWillUpdateThis')}</p><a href={telegram.link.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all font-semibold text-primary underline">{_t('onboarding:ui.openConnectionLink')}</a><button type="button" className="mt-2 block font-semibold text-primary underline" onClick={telegram.refresh}>{_t('onboarding:ui.checkConnectionNow')}</button></div>}{telegram.error && <p role="alert" className="text-sm text-danger">{telegram.error}</p>}</div>}
          {!capabilities.loading && capabilities.decision('telegram-assistant')?.allowed === false && <p className="mt-4 rounded-xl border border-border bg-surface-alt p-3 text-xs text-muted">{_t('onboarding:ui.youCanLinkTelegramButAssistantMessagesAreLimitedByYourCurrentPla')}</p>}
        </div>}

        {step === 'finish' && <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-selected text-primary"><CheckCircle2 size={34} /></span><h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="mt-6 font-display text-[clamp(2rem,6vw,3rem)] font-bold leading-tight tracking-tight">{_t('onboarding:ui.youreReadyToGo')}</h1><p className="mt-3 text-base leading-relaxed text-muted">{_t('onboarding:ui.yourOrbitWorkspaceIsReadyYouCanOrganizeEverythingAtYourOwnPace')}</p><ul className="mt-7 space-y-3 rounded-2xl border border-border bg-surface p-5 text-sm"><li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-success" />{' '}{_t('onboarding:ui.accountCreated')}</li>{actions.task && <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-success" />{' '}{_t('onboarding:ui.firstTaskCreated')}</li>}{actions.account && <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-success" />{' '}{_t('onboarding:ui.walletSetUp')}</li>}{linked && <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-success" />{' '}{_t('onboarding:ui.telegramConnected')}</li>}</ul></div>}

        {error && <p role="alert" className="mx-auto mt-5 max-w-xl rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      </div>

      <footer className="shrink-0 border-t border-border bg-surface/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-10 sm:pb-6 sm:pt-5"><div className="mx-auto flex max-w-xl items-center gap-3">
        {step === 'welcome' ? <div className="flex w-full flex-col gap-2"><button type="button" className="btn-primary h-12 w-full justify-center text-base" disabled={busy} onClick={() => progress('first-action')}>{_t('onboarding:ui.letsGetStarted')}{' '}<ArrowRight className="rtl-flip" size={18} /></button><button type="button" className="min-h-10 text-sm font-semibold text-muted underline hover:text-primary" onClick={dismiss}>{_t('onboarding:ui.skipForNow')}</button></div> : <>
          <button type="button" className="btn-secondary h-11 shrink-0" disabled={busy} onClick={() => progress(steps[index - 1])}><ArrowLeft className="rtl-flip" size={16} /><span className="hidden min-[350px]:inline">{_t('onboarding:ui.back')}</span></button>
          <div className="ms-auto flex min-w-0 items-center gap-2">{step === 'first-action' && !actions.task && !actions.account && <button type="button" className="min-h-11 px-2 text-xs font-semibold text-muted underline sm:text-sm" disabled={busy} onClick={() => progress('telegram')}>{_t('onboarding:ui.skipStep')}</button>}{step === 'telegram' && !linked && <button type="button" className="min-h-11 px-2 text-xs font-semibold text-muted underline sm:text-sm" disabled={busy} onClick={() => progress('finish')}>{_t('onboarding:ui.illDoThisLater')}</button>}
            {step === 'first-action' && selection && !actions.task && !actions.account ? <button type="submit" form="onboarding-action-form" className="btn-primary h-11 shrink-0" disabled={busy}>{busy ? _t('common:saving') : selection === 'task' ? _t('onboarding:ui.saveTask') : _t('onboarding:ui.saveWallet')}</button> : <button type="button" className="btn-primary h-11 shrink-0" disabled={busy} onClick={step === 'finish' ? complete : () => progress(step === 'first-action' ? 'telegram' : 'finish')}>{busy ? _t('common:saving') : step === 'finish' ? _t('onboarding:ui.goToMyDashboard') : _t('onboarding:ui.continue')} <ArrowRight className="rtl-flip" size={16} /></button>}
          </div>
        </>}
      </div>{step === 'finish' && <div className="mt-2 text-center"><Link to="/features" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline">{_t('onboarding:ui.exploreFeatures')}</Link></div>}</footer>
    </div>
  </div>;
}
