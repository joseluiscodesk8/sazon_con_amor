"use client";

import { useState } from "react";
import Dialogo from "@/components/Dialogo";
import { formatearPrecio } from "@/lib/format";
import type { Pedido } from "@/lib/pedidos";
import styles from "./ticket.module.scss";

type Formato = "58" | "80" | "a4";
type TamanoLetra = "normal" | "grande" | "muyGrande";

const FORMATOS: Record<
  Formato,
  { etiqueta: string; page: string; margen: string; ancho: string }
> = {
  "58": {
    etiqueta: "58 mm",
    page: "58mm auto",
    margen: "2mm",
    ancho: "54mm",
  },
  "80": {
    etiqueta: "80 mm",
    page: "80mm auto",
    margen: "3mm",
    ancho: "74mm",
  },
  a4: {
    etiqueta: "A4",
    page: "A4",
    margen: "12mm",
    ancho: "186mm",
  },
};

const BASE_FUENTE: Record<Formato, number> = {
  "58": 9,
  "80": 10,
  a4: 11,
};

const TAMANOS: Record<TamanoLetra, { etiqueta: string; escala: number }> = {
  normal: { etiqueta: "Normal", escala: 1 },
  grande: { etiqueta: "Grande", escala: 1.3 },
  muyGrande: { etiqueta: "Muy grande", escala: 1.6 },
};

function formatearFechaHora(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function esSopa(subcategoria: string) {
  return normalizar(subcategoria).includes("sopa");
}

export default function ImpresionPedido({
  pedido,
  className,
}: {
  pedido: Pedido;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [formato, setFormato] = useState<Formato>("80");
  const [tamano, setTamano] = useState<TamanoLetra>("grande");
  const config = FORMATOS[formato];
  const fuente = `${(BASE_FUENTE[formato] * TAMANOS[tamano].escala).toFixed(1)}pt`;
  const esMesero = pedido.origen === "mesero";
  const idDialogo = `ticket-dialogo-${pedido.id}`;
  const idTitulo = `ticket-titulo-${pedido.id}`;
  const cliente =
    pedido.cliente_nombre && pedido.cliente_nombre !== `Mesa ${pedido.mesa}`
      ? pedido.cliente_nombre
      : null;

  const cssImpresion = `
    @media print {
      @page { size: ${config.page}; margin: ${config.margen}; }
      html, body { background: #fff !important; }
      body * { visibility: hidden !important; }
      [data-ticket-print] {
        position: fixed;
        inset: 0 auto auto 0;
        width: ${config.ancho};
        margin: 0;
        padding: 0;
        background: #fff !important;
        color: #000 !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
        font-size: ${fuente};
        line-height: 1.35;
        box-shadow: none !important;
        border: none !important;
      }
      [data-ticket-print], [data-ticket-print] * {
        visibility: visible !important;
      }
      [data-no-print] { display: none !important; }
    }
  `;

  return (
    <>
      <button
        type="button"
        className={className ?? styles.boton}
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-controls={idDialogo}
      >
        Imprimir
      </button>

      {abierto ? (
        <Dialogo
          id={idDialogo}
          etiquetadoPor={idTitulo}
          onCerrar={() => setAbierto(false)}
          overlayClassName={styles.overlay}
          panelClassName={styles.modal}
        >
          <style>{cssImpresion}</style>

          <div className={styles.modalHead} data-no-print>
            <div>
              <h2 id={idTitulo}>
                {esMesero
                  ? "Imprimir ticket de cocina"
                  : `Imprimir pedido #${pedido.numero}`}
              </h2>
              <p>Elige el formato, el tamaño de letra y revisa la vista previa.</p>
            </div>
            <button
              type="button"
              className={styles.cerrar}
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <div
            className={styles.formatos}
            role="group"
            aria-label="Formato de impresión"
            data-no-print
          >
            {(Object.keys(FORMATOS) as Formato[]).map((opcion) => (
              <button
                key={opcion}
                type="button"
                className={`${styles.formato} ${
                  formato === opcion ? styles.formatoActivo : ""
                }`}
                onClick={() => setFormato(opcion)}
                aria-pressed={formato === opcion}
              >
                {FORMATOS[opcion].etiqueta}
              </button>
            ))}
          </div>

          <div
            className={styles.formatos}
            role="group"
            aria-label="Tamaño de letra"
            data-no-print
          >
            {(Object.keys(TAMANOS) as TamanoLetra[]).map((opcion) => (
              <button
                key={opcion}
                type="button"
                className={`${styles.formato} ${
                  tamano === opcion ? styles.formatoActivo : ""
                }`}
                onClick={() => setTamano(opcion)}
                aria-pressed={tamano === opcion}
              >
                {TAMANOS[opcion].etiqueta}
              </button>
            ))}
          </div>

          <div className={styles.preview}>
            {esMesero ? (
              <article
                data-ticket-print
                className={`${styles.ticket} ${
                  formato === "a4" ? styles.ticketA4 : ""
                }`}
                style={{ fontSize: fuente }}
              >
                <header className={styles.ticketHead}>
                  <h3>Mesa {pedido.mesa ?? "—"}</h3>
                  <p>Mesero: {pedido.mesero_nombre || "Sin asignar"}</p>
                </header>

                <ul className={`${styles.ticketItems} ${styles.ticketItemsMesa}`}>
                  {pedido.pedido_items.map((item) => {
                    const sopas = (item.opciones ?? []).filter((opcion) =>
                      esSopa(opcion.subcategoria),
                    );
                    const adiciones = item.adiciones ?? [];

                    return (
                      <li key={item.id}>
                        <div>
                          <strong>
                            {item.cantidad}× {item.nombre}
                          </strong>
                          {sopas.map((opcion, indice) => (
                            <small
                              key={`${opcion.subcategoria}-${opcion.opcion}-${indice}`}
                            >
                              {opcion.opcion}
                            </small>
                          ))}
                          {adiciones.map((adicion, indice) => (
                            <small key={`${adicion.nombre}-${indice}`}>
                              + {adicion.nombre}
                            </small>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ) : (
              <article
                data-ticket-print
                className={`${styles.ticket} ${
                  formato === "a4" ? styles.ticketA4 : ""
                }`}
                style={{ fontSize: fuente }}
              >
                <header className={styles.ticketHead}>
                  <h3>Sazón con Amor</h3>
                  <p>Pedido #{pedido.numero}</p>
                  <span>{formatearFechaHora(pedido.created_at)}</span>
                </header>

                <div className={styles.ticketMeta}>
                  <span>
                    {pedido.mesa ? `Mesa ${pedido.mesa}` : "Sin mesa"} ·{" "}
                    {pedido.tipo === "domicilio" ? "Domicilio" : "Restaurante"}
                  </span>
                  {pedido.origen === "mesero" ? (
                    <span>
                      Mesero: {pedido.mesero_nombre || "Sin asignar"}
                    </span>
                  ) : null}
                  {cliente ? (
                    <span>
                      {pedido.origen === "mesero" ? "Mesa" : "Cliente"}:{" "}
                      {cliente}
                    </span>
                  ) : null}
                </div>

                <ul className={styles.ticketItems}>
                  {pedido.pedido_items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>
                          {item.cantidad}× {item.nombre}
                        </strong>
                        {item.opciones && item.opciones.length > 0 ? (
                          <small>
                            {item.opciones
                              .map(
                                (opcion) =>
                                  `${opcion.subcategoria}: ${opcion.opcion}`,
                              )
                              .join(" · ")}
                          </small>
                        ) : null}
                        {item.adiciones && item.adiciones.length > 0 ? (
                          <small>
                            {item.adiciones
                              .map((adicion) => `+ ${adicion.nombre}`)
                              .join(" · ")}
                          </small>
                        ) : null}
                      </div>
                      <span>{formatearPrecio(item.precio * item.cantidad)}</span>
                    </li>
                  ))}
                </ul>

                {pedido.notas ? (
                  <p className={styles.ticketNotas}>Notas: {pedido.notas}</p>
                ) : null}

                <footer className={styles.ticketTotal}>
                  <span>Total</span>
                  <strong>{formatearPrecio(pedido.total)}</strong>
                </footer>

                <p className={styles.ticketPie}>Gracias por tu pedido</p>
              </article>
            )}
          </div>

          <div className={styles.modalAcciones} data-no-print>
            <button
              type="button"
              className={styles.imprimir}
              onClick={() => window.print()}
            >
              Imprimir
            </button>
          </div>
        </Dialogo>
      ) : null}
    </>
  );
}
