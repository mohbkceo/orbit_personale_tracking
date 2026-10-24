import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../context/TelegramContext.js';

const STEPS = ['welcome', 'first-action', 'telegram'];

const FEATURES = [
  {
    key: 'tasksBenefit',
    emoji: '📋',
    surface: 'bg-[linear-gradient(145deg,#EFF6FF_0%,#F8FBFF_100%)]',
    border: 'border-[#E2EBFC]',
  },
  {
    key: 'moneyBenefit',
    emoji: '💰',
    surface: 'bg-[linear-gradient(145deg,#FFF5E9_0%,#FFFCF7_100%)]',
    border: 'border-[#F7EBD9]',
  },
  {
    key: 'goalsBenefit',
    emoji: '🎯',
    surface: 'bg-[linear-gradient(145deg,#F5F0FF_0%,#FCFAFF_100%)]',
    border: 'border-[#EDE3FB]',
  },
  {
    key: 'remindersBenefit',
    emoji: '⏰',
    surface: 'bg-[linear-gradient(145deg,#ECFAF1_0%,#F9FDFB_100%)]',
    border: 'border-[#DDF1E5]',
  },
];

const focusStyle =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#416ADB]';

function Progress({ index }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={index + 1}
      aria-valuetext={`${index + 1} / ${STEPS.length}`}
      className="flex items-center justify-center gap-2"
    >
      {STEPS.map((item, i) => (
        <span
          key={item}
          aria-hidden="true"
          className={`h-[7px] rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
            i === index ? 'w-6 bg-[#18191C]' : 'w-[7px] bg-[#DFE2E8]'
          }`}
        />
      ))}
    </div>
  );
}

function Header({ index, onBack, busy, isRTL, t }) {
  return (
    <header className="relative z-10 grid shrink-0 grid-cols-[44px_1fr_44px] items-center px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:pt-6">
      <div>
        {index > 0 && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            aria-label={t('common:back', { defaultValue: 'Back' })}
            className={`grid h-11 w-11 place-items-center rounded-full text-[30px] font-light leading-none text-[#1B1B1F] transition-colors hover:bg-black/5 disabled:opacity-50 ${focusStyle}`}
          >
            <span aria-hidden="true" dir="ltr">
              {isRTL ? '›' : '‹'}
            </span>
          </button>
        )}
      </div>
      <Progress index={index} />
      <div aria-hidden="true" />
    </header>
  );
}

function EmojiBubble({ emoji, className, size = 'text-[30px]' }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute grid place-items-center rounded-[24px] border border-white/90 bg-white/85 ${size} shadow-xs ${className}`}
    >
      <span className="select-none leading-none">{emoji}</span>
    </span>
  );
}

function WelcomeArt() {
  return (
    <div className="relative mx-auto aspect-square w-[min(77vw,305px)] shrink-0" aria-hidden="true">
      <div className="absolute inset-[7%] rounded-full border border-white bg-[radial-gradient(circle_at_38%_30%,#F7F0FF_0%,#EDF5FF_50%,#F8FAFE_100%)]" />
      <div className="absolute inset-[19%] rounded-full border border-white/85 bg-white/40" />
      <div className="absolute inset-[32%] grid place-items-center rounded-[32px] border border-white bg-white/90 shadow-xs">
        <img src="/logo-orbit.png" alt="" className="h-[62%] w-[62%] object-contain" />
      </div>

      <EmojiBubble emoji="🗓️" className="left-[5%] top-[36%] h-[19%] w-[19%] rotate-[-10deg]" />
      <EmojiBubble emoji="🎯" className="right-[7%] top-[13%] h-[21%] w-[21%] rotate-[9deg]" />
      <EmojiBubble emoji="💸" className="left-[20%] top-[3%] h-[19%] w-[19%] rotate-[8deg]" />
      <EmojiBubble emoji="✅" className="right-[1%] top-[59%] h-[20%] w-[20%] rotate-[-7deg]" />
      <EmojiBubble emoji="⏰" className="bottom-[4%] left-[14%] h-[21%] w-[21%] rotate-[7deg]" />
      <span className="absolute bottom-[6%] right-[27%] text-[22px]" aria-hidden="true">
        ✨
      </span>
    </div>
  );
}

function TelegramArt() {
  return (
    <div
      className="relative mx-auto mt-1 grid h-[205px] w-[250px] place-items-center"
      aria-hidden="true"
    >
      <div className="absolute h-[192px] w-[192px] rounded-full bg-[radial-gradient(circle_at_38%_24%,#E8F5FF_0%,#EAF0FF_55%,#FAFBFF_100%)]" />
      <div className="absolute h-[145px] w-[145px] rounded-full border border-white/90" />
      <div className="relative grid h-[102px] w-[102px] place-items-center rounded-[31px] border border-white bg-white/85 shadow-xs">
        <span className="text-[55px] leading-none">✈️</span>
      </div>
      <EmojiBubble
        emoji="💬"
        className="absolute left-[2%] top-[17%] h-[55px] w-[55px] rotate-[-12deg]"
        size="text-[27px]"
      />
      <EmojiBubble
        emoji="🔔"
        className="absolute bottom-[10%] right-[1%] h-[58px] w-[58px] rotate-[10deg]"
        size="text-[27px]"
      />
    </div>
  );
}

function Title({ name, t, headingRef }) {
  return (
    <div className="mx-auto w-full max-w-[360px] text-center">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mx-auto max-w-[350px] text-[clamp(1.9rem,7.6vw,2.55rem)] font-bold leading-[1.12] tracking-[-0.045em] text-[#16171B] outline-none"
      >
        {t(`onboarding:flow.${name}Title`)}
      </h1>
      <p className="mx-auto mt-3 max-w-[325px] text-[14px] leading-[1.65] text-[#737882] sm:text-[15px]">
        {t(`onboarding:flow.${name}Description`)}
      </p>
    </div>
  );
}

function WelcomeStep({ t, headingRef }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-7 py-5 sm:gap-10">
      <WelcomeArt />
      <Title name="welcome" t={t} headingRef={headingRef} />
    </div>
  );
}

function FeaturesStep({ t, headingRef }) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-8 py-4">
      <Title name="first-action" t={t} headingRef={headingRef} />
      <div className="mx-auto grid w-full max-w-[365px] grid-cols-2 gap-3 sm:gap-4">
        {FEATURES.map(({ key, emoji, surface, border }) => (
          <div
            key={key}
            className={`flex min-h-[142px] flex-col items-start justify-between rounded-[25px] border p-[17px] sm:min-h-[158px] sm:p-5 ${surface} ${border}`}
          >
            <span className="text-[35px] leading-none" aria-hidden="true">
              {emoji}
            </span>
            <span className="mt-5 text-start text-[15px] font-semibold leading-snug tracking-[-0.015em] text-[#1D1F25]">
              {t(`onboarding:flow.${key}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TelegramStep({ t, headingRef, telegram, busy }) {
  const connected = Boolean(telegram.status?.connected);
  const unavailable = !telegram.loading && !telegram.status?.botUrl && !connected;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-7 py-5">
      <TelegramArt />
      <Title name="telegram" t={t} headingRef={headingRef} />
      <div className="w-full max-w-[350px]">
        {connected ? (
          <div
            role="status"
            className="rounded-[20px] border border-[#DBEFDF] bg-[#F1FAF2] px-4 py-[15px] text-center text-[15px] font-semibold text-[#267147]"
          >
            {`✅ ${t('onboarding:flow.telegramConnected')}`}
          </div>
        ) : (
          <button
            type="button"
            onClick={telegram.connect}
            disabled={busy || telegram.busy || telegram.loading || !telegram.status?.botUrl}
            className={`min-h-[54px] w-full rounded-full border border-[#DDE8FC] bg-[linear-gradient(115deg,#F1F7FF_0%,#F7F5FF_100%)] px-4 text-[15px] font-semibold text-[#2855A1] transition-colors hover:bg-[#EDF4FF] disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`}
          >
            {telegram.busy ? t('onboarding:flow.connecting') : t('onboarding:flow.connectTelegram')}
          </button>
        )}
        {telegram.error && (
          <p role="alert" className="mt-3 text-center text-sm text-red-700">
            {telegram.error}
          </p>
        )}
        {unavailable && (
          <p className="mt-3 text-center text-sm text-[#737882]">
            {t('onboarding:flow.telegramLater')}
          </p>
        )}
      </div>
    </div>
  );
}

export function OnboardingExperience({ state, update, onExit }) {
  const { t, i18n } = useTranslation();
  const telegram = useTelegram();
  const setTelegramWatching = telegram.setWatching;
  const isRTL = i18n.dir() === 'rtl';

  const [step, setStep] = useState(() =>
    state.status === 'IN_PROGRESS' && STEPS.includes(state.step) ? state.step : 'welcome',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const headingRef = useRef(null);
  const index = Math.max(0, STEPS.indexOf(step));
  const isLastStep = index === STEPS.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

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
      setError(failure?.message || t('onboarding:flow.saveError'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="grid min-h-dvh bg-[#F3F5F9] text-[#18191D] sm:place-items-center sm:p-6"
    >
      <div className="relative isolate flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-white sm:h-[min(840px,calc(100dvh-3rem))] sm:max-w-[440px] sm:rounded-[38px] sm:border sm:border-[#E8EBF2] sm:shadow-xs">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_at_18%_10%,#F1F4FF_0%,#F8FAFF_46%,#FFFFFF_90%)]"
        />
        <Header
          index={index}
          busy={busy || telegram.busy}
          isRTL={isRTL}
          t={t}
          onBack={() => act('IN_PROGRESS', STEPS[index - 1])}
        />

        <section className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3 sm:px-8 sm:py-4">
          {step === 'welcome' && <WelcomeStep t={t} headingRef={headingRef} />}
          {step === 'first-action' && <FeaturesStep t={t} headingRef={headingRef} />}
          {step === 'telegram' && (
            <TelegramStep t={t} headingRef={headingRef} telegram={telegram} busy={busy} />
          )}

          {error && (
            <div
              role="alert"
              className="mx-auto mt-3 max-w-[350px] rounded-[17px] border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700"
            >
              <p>{error}</p>
              <a
                href="/subscribe"
                className={`mt-2 inline-block font-semibold underline underline-offset-2 ${focusStyle}`}
              >
                {t('onboarding:flow.continuePlans')}
              </a>
            </div>
          )}
        </section>

        <footer className="relative z-20 shrink-0 border-t border-[#F0F1F5] bg-white/85 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl sm:px-8 sm:pb-6">
          <div className="mx-auto flex w-full max-w-[370px] flex-col gap-2.5">
            <button
              type="button"
              disabled={busy || telegram.busy}
              onClick={() => (isLastStep ? act('COMPLETED') : act('IN_PROGRESS', STEPS[index + 1]))}
              className={`min-h-[54px] w-full rounded-full bg-[#18191C] px-6 text-[16px] font-semibold text-white transition-colors hover:bg-[#303239] disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`}
            >
              {busy ? t('common:saving') : t('onboarding:flow.next')}
            </button>
            <button
              type="button"
              disabled={busy || telegram.busy}
              onClick={() => act('SKIPPED')}
              className={`min-h-[49px] w-full rounded-full bg-[#F2F3F6] px-6 text-[15px] font-semibold text-[#5D626D] transition-colors hover:bg-[#ECEEF3] disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`}
            >
              {t('onboarding:flow.skip')}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
