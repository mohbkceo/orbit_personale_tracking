import { motion, useReducedMotion } from 'motion/react';
import { page, reduced } from './motionPresets.js';
export function AnimatedPage({ children }) {
  const reduce = useReducedMotion();
  return <motion.div {...(reduce ? reduced(page) : page)}>{children}</motion.div>;
}
