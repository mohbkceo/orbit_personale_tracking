import { motion, useReducedMotion } from 'motion/react';
import { progressSpring } from './motionPresets.js';

export function AnimatedProgress({ value, className = '', fillClassName = 'bg-accent dark:bg-lime' }) {
  const reduce = useReducedMotion();
  const progress = Math.min(100, Math.max(0, Number(value) || 0));
  return <div className={`overflow-hidden rounded-full bg-[#e8ece6] dark:bg-white/10 ${className}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
    <motion.div className={`h-full rounded-full ${fillClassName}`} initial={{ width: reduce ? `${progress}%` : 0 }} animate={{ width: `${progress}%` }} transition={reduce ? { duration: 0 } : progressSpring} />
  </div>;
}
