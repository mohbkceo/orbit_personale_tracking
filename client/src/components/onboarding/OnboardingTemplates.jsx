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

function Title({ name, t, headingRef, emoji }) {
  return (
    <div className="mx-auto w-full max-w-[360px] text-center">
      {emoji && (
        <span aria-hidden="true" className="mb-3 block text-3xl">
          {emoji}
        </span>
      )}
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

function WelcomeStep({ t, headingRef, emoji }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-7 py-5 sm:gap-10">
      <WelcomeArt />
      <Title name="welcome" t={t} headingRef={headingRef} emoji={emoji} />
    </div>
  );
}

function FeaturesStep({ t, headingRef, emoji }) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-8 py-4">
      <Title name="first-action" t={t} headingRef={headingRef} emoji={emoji} />
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

function TelegramStep({ t, headingRef, telegram, busy, emoji }) {
  const connected = Boolean(telegram.status?.connected);
  const unavailable = !telegram.loading && !telegram.status?.botUrl && !connected;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-7 py-5">
      <TelegramArt />
      <Title name="telegram" t={t} headingRef={headingRef} emoji={emoji} />
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

export function OnboardingTemplate({ page, t, language, headingRef, telegram, busy }) {
  const templateT = (key, options) =>
    key === `onboarding:flow.${page.kind === 'features' ? 'first-action' : page.kind}Title`
      ? page.title?.[language] || page.title?.en
      : key ===
          `onboarding:flow.${page.kind === 'features' ? 'first-action' : page.kind}Description`
        ? page.description?.[language] || page.description?.en
        : t(key, { ...options, lng: language });
  if (page.kind === 'welcome')
    return <WelcomeStep t={templateT} headingRef={headingRef} emoji={page.emoji} />;
  if (page.kind === 'features')
    return <FeaturesStep t={templateT} headingRef={headingRef} emoji={page.emoji} />;
  if (page.kind === 'telegram')
    return (
      <TelegramStep
        t={templateT}
        headingRef={headingRef}
        telegram={telegram}
        busy={busy}
        emoji={page.emoji}
      />
    );
  return null;
}
