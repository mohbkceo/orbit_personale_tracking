import { useOrbitReducedMotion } from './useOrbitReducedMotion.js';
import { motion } from 'motion/react';
import { progressSpring } from './motionPresets.js';

export function AnimatedProgress({ value, className = '', fillClassName = 'bg-primary' }) {
  const reduce = useOrbitReducedMotion();
  const progress = Math.min(100, Math.max(0, Number(value) || 0));
  return <div className={`overflow-hidden rounded-full bg-surface-alt  ${className}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
    <motion.div className={`h-full rounded-full ${fillClassName}`} initial={{ width: reduce ? `${progress}%` : 0 }} animate={{ width: `${progress}%` }} transition={reduce ? { duration: 0 } : progressSpring} />
  </div>;
}
