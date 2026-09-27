import { useOrbitReducedMotion } from './useOrbitReducedMotion.js';
import { motion } from 'motion/react';
import { page, reduced } from './motionPresets.js';
export function AnimatedPage({ children }) {
  const reduce = useOrbitReducedMotion();
  return <motion.div {...(reduce ? reduced(page) : page)}>{children}</motion.div>;
}
