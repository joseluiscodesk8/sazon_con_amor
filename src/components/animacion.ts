import type { Transition, Variants } from "framer-motion";

export const entradaSalida: Variants = {
  oculto: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  salida: { opacity: 0, y: -10, scale: 0.98 },
};

export const entradaPantalla: Variants = {
  oculto: { opacity: 0, x: 18 },
  visible: { opacity: 1, x: 0 },
  salida: { opacity: 0, x: -18 },
};

export const transicionSuave: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};
