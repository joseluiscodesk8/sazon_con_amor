import type { ReactNode } from "react";

type IconoProps = {
  className?: string;
};

function Icono({
  children,
  className,
}: IconoProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconoAgotado(props: IconoProps) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </Icono>
  );
}

export function IconoDisponible(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icono>
  );
}

export function IconoEditar(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </Icono>
  );
}

export function IconoEliminar(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </Icono>
  );
}

export function IconoOcultar(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.3 10 7a12.7 12.7 0 0 1-2.4 3.4" />
      <path d="M6.2 6.2C4.2 7.6 2.8 9.6 2 12c1 2.7 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Icono>
  );
}

export function IconoMostrar(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M2 12c1-2.7 5-7 10-7s9 4.3 10 7c-1 2.7-5 7-10 7S3 14.7 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icono>
  );
}

export function IconoCancelar(props: IconoProps) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </Icono>
  );
}

export function IconoImprimir(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </Icono>
  );
}

export function IconoAnadir(props: IconoProps) {
  return (
    <Icono {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icono>
  );
}
