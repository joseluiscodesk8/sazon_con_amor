"use client";

import { useEffect, useRef, type ReactNode } from "react";

const SELECTOR_ENFOCABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Props = {
  id?: string;
  etiquetadoPor: string;
  onCerrar?: () => void;
  overlayClassName: string;
  panelClassName: string;
  children: ReactNode;
  cerrarConEscape?: boolean;
  cerrarAlHacerClicFuera?: boolean;
};

export default function Dialogo({
  id,
  etiquetadoPor,
  onCerrar,
  overlayClassName,
  panelClassName,
  children,
  cerrarConEscape = true,
  cerrarAlHacerClicFuera = true,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(onCerrar);

  useEffect(() => {
    cerrarRef.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const anterior =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflowAnterior = document.body.style.overflow;

    const enfocables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES),
      ).filter(
        (elemento) =>
          elemento.tabIndex !== -1 && elemento.getClientRects().length > 0,
      );

    const primerElemento = enfocables()[0];
    (primerElemento ?? panel).focus();
    document.body.style.overflow = "hidden";

    function alPresionarTecla(event: KeyboardEvent) {
      if (event.key === "Escape" && cerrarConEscape) {
        if (!cerrarRef.current) return;
        event.preventDefault();
        cerrarRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const lista = enfocables();
      if (lista.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const actual = document.activeElement;
      const indice = actual instanceof HTMLElement ? lista.indexOf(actual) : -1;

      if (event.shiftKey && indice <= 0) {
        event.preventDefault();
        lista[lista.length - 1].focus();
        return;
      }

      if (!event.shiftKey && (indice === -1 || indice === lista.length - 1)) {
        event.preventDefault();
        lista[0].focus();
      }
    }

    document.addEventListener("keydown", alPresionarTecla, true);

    return () => {
      document.removeEventListener("keydown", alPresionarTecla, true);
      document.body.style.overflow = overflowAnterior;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [cerrarAlHacerClicFuera, cerrarConEscape]);

  return (
    <div
      className={overlayClassName}
      onClick={(event) => {
        if (
          cerrarAlHacerClicFuera &&
          event.target === event.currentTarget &&
          cerrarRef.current
        ) {
          cerrarRef.current();
        }
      }}
    >
      <div
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={etiquetadoPor}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
}
