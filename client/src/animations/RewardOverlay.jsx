import { useOrbitReducedMotion } from './useOrbitReducedMotion.js';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import { timing, ease } from './motionPresets.js';

const duration = { small: timing.rewardSmall, medium: timing.rewardMedium, major: timing.rewardMajor };

export function RewardOverlay({ reward }) {
  const reduce = useOrbitReducedMotion();
  return <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[90] flex justify-center px-4 md:bottom-8" aria-live="polite" aria-atomic="true">
    <AnimatePresence mode="wait">
      {reward && <motion.div key={reward.id} initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : -8 }} transition={{ duration: reduce ? timing.micro : timing.list, ease }} className="relative flex min-w-48 items-center gap-3 overflow-hidden rounded-2xl border border-sidebar-hover bg-sidebar px-4 py-3 text-sidebar-text shadow-lift">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          {reward.effect === 'checkBurst' || reward.effect === 'celebration' || reward.effect === 'none' ? <Check size={20} strokeWidth={3}/> : <Sparkles size={18}/>}
          {!reduce && reward.effect !== 'none' && <>
            <motion.span className="absolute inset-0 rounded-full border border-accent/70" initial={{ scale: .5, opacity: .8 }} animate={{ scale: reward.level === 'major' ? 2.4 : 1.8, opacity: 0 }} transition={{ duration: duration[reward.level], ease }}/>
            {(reward.effect === 'orbit' || reward.effect === 'celebration') && <motion.span className="absolute -inset-1 rounded-full border border-dashed border-accent/50" initial={{ rotate: 0, opacity: .8 }} animate={{ rotate: 100, opacity: 0 }} transition={{ duration: duration[reward.level], ease }} />}
            {(reward.effect === 'orbit' || reward.effect === 'celebration' || reward.effect === 'checkBurst') && [0, 1, 2, 3, 4, 5].map((n) => <motion.span key={n} className="absolute h-1 w-1 rounded-full bg-accent" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(n * Math.PI / 3) * (reward.level === 'major' ? 31 : 22), y: Math.sin(n * Math.PI / 3) * (reward.level === 'major' ? 31 : 22), opacity: 0 }} transition={{ duration: duration[reward.level], ease }}/>) }
          </>}
        </span>
        <span><span className="block text-sm font-semibold">{reward.message}</span>{reward.detail && <span className="block text-xs text-sidebar-muted">{reward.detail}</span>}</span>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
