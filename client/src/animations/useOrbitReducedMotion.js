import { useReducedMotion } from 'motion/react';
import { useApp } from '../context/useApp.js';

export function useOrbitReducedMotion() {
  const system = useReducedMotion();
  const app = useApp();
  return system || app?.settings?.appearance?.motion === 'reduced';
}
