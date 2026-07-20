import type { Transition, Variants } from "framer-motion";

/** Expo-style ease-out — fast start, long elegant settle. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const SPRING: Transition = { type: "spring", stiffness: 300, damping: 32, mass: 0.9 };

export const SPRING_SOFT: Transition = { type: "spring", stiffness: 200, damping: 28, mass: 1 };

/** Staggered entrance: pass the child's index as the `custom` prop. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: EASE_OUT, delay: 0.07 * i },
  }),
};

export const cardReveal: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.985,
    filter: "blur(6px)",
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};
