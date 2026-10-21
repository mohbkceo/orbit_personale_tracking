import { useTranslation } from 'react-i18next';
import { Check, Moon, Monitor, Sun } from 'lucide-react';
import { isDarkMode, orderedThemes, previewStyle, recommendedThemes } from './themes.js';

const choices = {
  personality: ['focus', 'balanced', 'expressive'],
  density: ['comfortable', 'compact'],
  radius: ['soft', 'rounded'],
  motion: ['full', 'reduced'],
};

function ChoiceGroup({ title, options, selected, onChange, columns = 'sm:grid-cols-3' }) {
  const { t } = useTranslation();
  return <div><h3 className="mb-3 text-sm font-bold">{title}</h3><div className={`grid gap-2 ${columns}`}>{options.map((id) => <button type="button" key={id} aria-pressed={selected === id} onClick={() => onChange(id)} className={`rounded-xl border p-3 text-start text-sm transition-colors ${selected === id ? 'border-primary bg-selected text-text' : 'border-border bg-surface hover:bg-hover'}`}><span className="flex items-center justify-between font-semibold">{t(`settings:appearanceChoices.${id}`)}{selected === id && <Check size={16} className="text-primary" />}</span>{options === choices.personality && <span className="mt-1 block text-xs text-muted">{t(`settings:appearanceChoices.${id}Description`)}</span>}</button>)}</div></div>;
}

export function ColorModePicker({ value, onChange }) {
  const { t: _t } = useTranslation();
  return <div><h3 className="mb-3 text-sm font-bold">{_t('settings:ui.colorMode')}</h3><div className="grid gap-2 sm:grid-cols-3">{[['light',Sun],['system',Monitor],['dark',Moon]].map(([id,Icon]) => <button type="button" aria-pressed={value === id} key={id} onClick={() => onChange(id)} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${value === id ? 'border-primary bg-selected' : 'border-border bg-surface hover:bg-hover'}`}><Icon size={18} className="text-primary" />{_t(`settings:appearanceChoices.${id}`)}{value === id && <Check size={16} className="ms-auto text-primary" />}</button>)}</div></div>;
}

function ThemeCard({ id, selected, dark, onChange }) {
  const { t } = useTranslation();
  const name = t(`settings:themes.${id}.name`);
  return <button type="button" aria-label={t('settings:appearanceChoices.styleLabel', { name })} aria-pressed={selected} onClick={() => onChange(id)} className={`overflow-hidden rounded-[var(--orbit-radius)] border text-start transition-colors ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}>
    <div className="theme-preview h-28 overflow-hidden bg-canvas p-2.5" style={previewStyle(id, dark)}>
      <div className="flex h-full gap-2"><div className="flex w-10 flex-col gap-2 border-r border-border bg-sidebar p-2"><div className="h-3 w-3 rounded-full bg-accent" /><div className="h-1.5 w-full rounded bg-sidebar-selected" /><div className="h-1.5 w-4/5 rounded bg-sidebar-muted/60" /><div className="mt-auto h-1.5 w-3/4 rounded bg-sidebar-hover" /></div><div className="flex-1"><div className="mb-2 h-2 w-2/3 rounded bg-text/70" /><div className="grid grid-cols-2 gap-1.5"><div className="h-12 rounded-lg border border-border bg-surface p-2"><div className="h-1.5 w-3/4 rounded bg-text/50" /><div className="mt-2 h-2 w-1/2 rounded bg-primary" /></div><div className="h-12 rounded-lg border border-border bg-surface p-2"><div className="h-1.5 w-3/4 rounded bg-muted/50" /><div className="mt-2 h-2 w-1/2 rounded bg-accent" /></div></div></div></div>
    </div>
    <div className="flex items-start justify-between gap-2 bg-surface p-3"><div><span className="text-sm font-bold">{name}</span><span className="mt-0.5 block text-xs text-muted">{t(`settings:themes.${id}.description`)}</span></div>{selected && <Check size={18} className="shrink-0 text-primary" />}</div>
  </button>;
}

export function WorkspaceStylePicker({ value, mode, gender, onChange }) {
  const { t: _t } = useTranslation();
  const recommended = recommendedThemes(gender);
  const ordered = orderedThemes(gender);
  const dark = isDarkMode(mode);
  return <div><h3 className="text-sm font-bold">{_t('settings:ui.workspaceStyle')}</h3><p className="mb-4 mt-1 text-xs text-muted">{_t('settings:ui.everyStyleIsAvailableToEveryoneRecommendationsOnlyChangeTheOrder')}</p><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{_t('settings:ui.recommended')}</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{recommended.map((id) => <ThemeCard key={id} id={id} selected={value === id} dark={dark} onChange={onChange} />)}</div><p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted">{_t('settings:ui.moreStyles')}</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{ordered.filter((id) => !recommended.includes(id)).map((id) => <ThemeCard key={id} id={id} selected={value === id} dark={dark} onChange={onChange} />)}</div></div>;
}

export function AppearancePicker({ appearance, gender, onChange, onboarding = false }) {
  const { t: _t } = useTranslation();
  const set = (key) => (value) => onChange({ ...appearance, [key]: value });
  return <div className="space-y-7"><ColorModePicker value={appearance.mode} onChange={set('mode')} /><WorkspaceStylePicker value={appearance.preset} mode={appearance.mode} gender={gender} onChange={set('preset')} />{!onboarding && <><ChoiceGroup title={_t('settings:ui.workspacePersonality')} options={choices.personality} selected={appearance.personality} onChange={set('personality')} /><div><h3 className="mb-3 text-sm font-bold">{_t('settings:ui.interface')}</h3><div className="space-y-5"><ChoiceGroup title={_t('settings:ui.density')} options={choices.density} selected={appearance.density} onChange={set('density')} columns="sm:grid-cols-2" /><ChoiceGroup title={_t('settings:ui.corners')} options={choices.radius} selected={appearance.radius} onChange={set('radius')} columns="sm:grid-cols-2" /><ChoiceGroup title={_t('settings:ui.motion')} options={choices.motion} selected={appearance.motion} onChange={set('motion')} columns="sm:grid-cols-2" /></div></div></>}</div>;
}
