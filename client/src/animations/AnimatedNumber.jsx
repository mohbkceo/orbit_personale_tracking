import { useEffect, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';
import { progressSpring } from './motionPresets.js';

export function AnimatedNumber({ value, format = (number) => Math.round(number) }) {
  const target = Number(value) || 0;
  const reduce = useReducedMotion();
  const number = useSpring(target, progressSpring);
  const [display, setDisplay] = useState(target);
  useMotionValueEvent(number, 'change', (latest) => setDisplay(latest));
  useEffect(() => { if (reduce) { number.jump(target); setDisplay(target); } else number.set(target); }, [target, reduce, number]);
  return <>{format(display)}</>;
}
