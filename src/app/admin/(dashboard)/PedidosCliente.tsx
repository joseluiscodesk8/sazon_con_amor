"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  entradaPantalla,
  entradaSalida,
  transicionSuave,
} from "@/components/animacion";
import { IconoCancelar, IconoEliminar } from "@/components/Iconos";
import { formatearPrecio } from "@/lib/format";
import {
  ESTADO_LABEL,
  formatearHora,
  type EstadoPedido,
  type MesaAbierta,
  type MesaCerrada,
  type Pedido,
  type TipoPedido,
} from "@/lib/pedidos";
import {
  cancelarPedido,
  cerrarMesa,
  eliminarPedido,
  limpiarHistorialMesas,
} from "./pedidos-actions";
import { useAvisos } from "./AvisosProvider";
import ImpresionPedido from "./ImpresionPedido";
import styles from "./pedidos.module.scss";

type Filtro = "todos" | TipoPedido | "mesero";

const ACTIVOS: EstadoPedido[] = ["nuevo", "en_preparacion", "listo", "en_camino"];

const variantesWrap: Variants = {
  oculto: { height: 0, opacity: 0, overflow: "hidden" },
  visible: { height: "auto", opacity: 1, overflow: "hidden" },
  salida: { height: 0, opacity: 0, overflow: "hidden" },
};

export default function PedidosCliente({
  pedidos,
  mesasAbiertas,
  mesasCerradas,
}: {
  pedidos: Pedido[];
  mesasAbiertas: MesaAbierta[];
  mesasCerradas: MesaCerrada[];
}) {
  const router = useRouter();
  const { sonido, alternarSonido } = useAvisos();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [soloActivos, setSoloActivos] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [cerrandoMesa, setCerrandoMesa] = useState<number | null>(null);
  const [limpiando, setLimpiando] = useState(false);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<number | null>(null);
  const [mesasExpandidas, setMesasExpandidas] = useState(false);
  const [mesasPrevias, setMesasPrevias] = useState(mesasAbiertas);
  const [mesasOverride, setMesasOverride] = useState<MesaAbierta[] | null>(
    null,
  );
  const [, startTransition] = useTransition();

  if (mesasAbiertas !== mesasPrevias) {
    setMesasPrevias(mesasAbiertas);
    setMesasOverride(null);
    if (
      mesaSeleccionada !== null &&
      !mesasAbiertas.some((sesion) => sesion.mesa === mesaSeleccionada)
    ) {
      setMesaSeleccionada(null);
    }
  }

  const mesasAbiertasLocales = mesasOverride ?? mesasAbiertas;

  const visibles = useMemo(() => {
    let lista = pedidos;

    if (filtro === "mesero") {
      lista = lista.filter(
        (p) => p.tipo === "restaurante" && p.origen === "mesero",
      );
    } else if (filtro === "restaurante") {
      lista = lista.filter(
        (p) => p.tipo === "restaurante" && p.origen !== "mesero",
      );
    } else if (filtro === "domicilio") {
      lista = lista.filter((p) => p.tipo === "domicilio");
    }

    if (soloActivos) lista = lista.filter((p) => ACTIVOS.includes(p.estado));
    return lista;
  }, [pedidos, filtro, soloActivos]);

  const gruposMesa = useMemo(() => {
    const mapa = new Map<number, Pedido[]>();

    for (const pedido of visibles) {
      if (pedido.tipo !== "restaurante" || pedido.mesa == null) continue;
      if (!ACTIVOS.includes(pedido.estado)) continue;

      const lista = mapa.get(pedido.mesa) ?? [];
      lista.push(pedido);
      mapa.set(pedido.mesa, lista);
    }

    return [...mapa.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mesa, tickets]) => ({
        mesa,
        tickets: [...tickets].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      }));
  }, [visibles]);

  const gruposVisibles = useMemo(
    () =>
      mesaSeleccionada === null
        ? gruposMesa
        : gruposMesa.filter(({ mesa }) => mesa === mesaSeleccionada),
    [gruposMesa, mesaSeleccionada],
  );

  const idsCerrados = useMemo(
    () =>
      new Set(
        mesasCerradas.flatMap((sesion) =>
          sesion.pedidos.map((pedido) => pedido.id),
        ),
      ),
    [mesasCerradas],
  );

  const restauranteHistorial = useMemo(
    () =>
      visibles.filter(
        (p) =>
          p.tipo === "restaurante" &&
          !ACTIVOS.includes(p.estado) &&
          !idsCerrados.has(p.id),
      ),
    [visibles, idsCerrados],
  );

  const domicilio = useMemo(
    () => visibles.filter((p) => p.tipo === "domicilio"),
    [visibles],
  );

  const mesasResumen = useMemo(() => {
    const totales = new Map<number, number>();
    const tickets = new Map<number, number>();

    for (const pedido of pedidos) {
      if (
        pedido.tipo !== "restaurante" ||
        pedido.origen !== "mesero" ||
        pedido.mesa == null ||
        !ACTIVOS.includes(pedido.estado)
      ) {
        continue;
      }

      totales.set(pedido.mesa, (totales.get(pedido.mesa) ?? 0) + pedido.total);
      tickets.set(pedido.mesa, (tickets.get(pedido.mesa) ?? 0) + 1);
    }

    return mesasAbiertasLocales
      .map((sesion) => ({
        ...sesion,
        total: totales.get(sesion.mesa) ?? 0,
        tickets: tickets.get(sesion.mesa) ?? 0,
      }))
      .sort((a, b) => a.mesa - b.mesa);
  }, [mesasAbiertasLocales, pedidos]);

  const hayPedidos =
    gruposMesa.length > 0 ||
    restauranteHistorial.length > 0 ||
    domicilio.length > 0 ||
    mesasCerradas.length > 0;

  const contar = (tipo: Filtro) => {
    if (tipo === "todos") return pedidos.length;
    if (tipo === "mesero") {
      return pedidos.filter(
        (p) => p.tipo === "restaurante" && p.origen === "mesero",
      ).length;
    }
    if (tipo === "restaurante") {
      return pedidos.filter(
        (p) => p.tipo === "restaurante" && p.origen !== "mesero",
      ).length;
    }
    return pedidos.filter((p) => p.tipo === tipo).length;
  };

  function onCancelar(pedido: Pedido) {
    if (!confirm(`¿Cancelar el pedido #${pedido.numero}?`)) return;

    setProcesando(pedido.id);
    startTransition(async () => {
      const res = await cancelarPedido(pedido.id);
      if (!res.ok) {
        setProcesando(null);
        alert(res.error);
        return;
      }
      router.refresh();
      setProcesando(null);
    });
  }

  function onEliminar(pedido: Pedido) {
    if (
      !confirm(
        `¿Eliminar definitivamente el pedido #${pedido.numero}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setProcesando(pedido.id);
    startTransition(async () => {
      const res = await eliminarPedido(pedido.id);
      if (!res.ok) {
        setProcesando(null);
        alert(res.error);
        return;
      }
      router.refresh();
      setProcesando(null);
    });
  }

  function seleccionarMesa(mesa: number) {
    if (mesaSeleccionada === mesa) {
      setMesaSeleccionada(null);
      setMesasExpandidas(false);
      return;
    }

    setMesaSeleccionada(mesa);
    setMesasExpandidas(true);
  }

  function onCerrarMesa(mesa: number) {
    if (
      !confirm(
        `¿Cerrar la mesa ${mesa}? El ticket quedará guardado en el historial y la mesa quedará libre.`,
      )
    )
      return;

    setCerrandoMesa(mesa);
    startTransition(async () => {
      const res = await cerrarMesa(mesa);
      if (!res.ok) {
        setCerrandoMesa(null);
        alert(res.error);
        return;
      }
      setMesasOverride((actuales) =>
        (actuales ?? mesasAbiertas).filter((sesion) => sesion.mesa !== mesa),
      );
      setMesaSeleccionada((actual) => (actual === mesa ? null : actual));
      router.refresh();
      setCerrandoMesa(null);
    });
  }

  function onLimpiarHistorial() {
    const totalTickets = mesasCerradas.reduce(
      (acc, sesion) => acc + sesion.pedidos.length,
      0,
    );

    if (
      !confirm(
        `¿Borrar el historial de mesas cerradas? Se eliminarán ${mesasCerradas.length} ${
          mesasCerradas.length === 1 ? "mesa" : "mesas"
        } y ${totalTickets} ${
          totalTickets === 1 ? "ticket" : "tickets"
        }. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setLimpiando(true);
    startTransition(async () => {
      const res = await limpiarHistorialMesas();
      if (!res.ok) {
        setLimpiando(false);
        alert(res.error);
        return;
      }
      router.refresh();
      setLimpiando(false);
    });
  }

  function renderPedido(pedido: Pedido, soloImprimir = false) {
    const etiquetaTipo =
      pedido.tipo === "domicilio"
        ? "Domicilio"
        : pedido.origen === "mesero"
          ? "Mesero"
          : "Restaurante";

    return (
      <motion.article
        key={pedido.id}
        variants={entradaSalida}
        initial="oculto"
        animate="visible"
        exit="salida"
        transition={transicionSuave}
        className={styles.card}
      >
        <header className={styles.cardHead}>
          <div>
            <span className={styles.numero}>#{pedido.numero}</span>
            <span
              className={`${styles.tipoBadge} ${
                pedido.tipo === "domicilio"
                  ? styles.tipoDomicilio
                  : pedido.origen === "mesero"
                    ? styles.tipoMesero
                    : styles.tipoRestaurante
              }`}
            >
              {etiquetaTipo}
            </span>
          </div>
          <span
            className={`${styles.estadoBadge} ${
              styles[`estado_${pedido.estado}`]
            }`}
          >
            {ESTADO_LABEL[pedido.estado]}
          </span>
        </header>

        <div className={styles.meta}>
          <span>🕒 {formatearHora(pedido.created_at)}</span>
          {pedido.mesa ? <span>🪑 Mesa {pedido.mesa}</span> : null}
          {pedido.origen === "mesero" ? (
            <span>🛎️ Mesero: {pedido.mesero_nombre || "Sin asignar"}</span>
          ) : null}
          {pedido.cliente_nombre &&
          pedido.cliente_nombre !== `Mesa ${pedido.mesa}` ? (
            <span>👤 {pedido.cliente_nombre}</span>
          ) : null}
          {pedido.cliente_telefono ? (
            <a href={`tel:${pedido.cliente_telefono}`}>
              📞 {pedido.cliente_telefono}
            </a>
          ) : null}
          {pedido.direccion || pedido.lugar ? (
            <span>
              📍{" "}
              {pedido.lugar ? <strong>{pedido.lugar}</strong> : null}
              {pedido.lugar && pedido.direccion ? " · " : null}
              {pedido.direccion}
            </span>
          ) : null}
        </div>

        <ul className={styles.items}>
          <AnimatePresence initial={false}>
            {pedido.pedido_items.map((item) => (
              <motion.li
                key={item.id}
                variants={entradaSalida}
                initial="oculto"
                animate="visible"
                exit="salida"
                transition={transicionSuave}
              >
                <span>
                  <strong>{item.cantidad}×</strong> {item.nombre}
                  {item.opciones && item.opciones.length > 0 ? (
                    <span className={styles.opciones}>
                      {item.opciones
                        .map((o) => `${o.subcategoria}: ${o.opcion}`)
                        .join(" · ")}
                    </span>
                  ) : null}
                  {item.adiciones && item.adiciones.length > 0 ? (
                    <span className={styles.adiciones}>
                      {item.adiciones
                        .map(
                          (a) => `+ ${a.nombre} (${formatearPrecio(a.precio)})`,
                        )
                        .join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span>{formatearPrecio(item.precio * item.cantidad)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {pedido.notas ? (
          <p className={styles.notas}>📝 {pedido.notas}</p>
        ) : null}

        <div className={styles.cardFooter}>
          <span className={styles.total}>
            Total: <strong>{formatearPrecio(pedido.total)}</strong>
          </span>
          <div className={styles.acciones}>
            {!soloImprimir && ACTIVOS.includes(pedido.estado) ? (
              <button
                type="button"
                disabled={procesando === pedido.id}
                onClick={() => onCancelar(pedido)}
                className={`${styles.accion} ${styles.accionCancelar}`}
                aria-label={`Cancelar pedido #${pedido.numero}`}
              >
                <IconoCancelar />
                <span className={styles.textoAccion}>Cancelar</span>
              </button>
            ) : null}
            <ImpresionPedido pedido={pedido} className={styles.accion} />
            {!soloImprimir ? (
              <button
                type="button"
                disabled={procesando === pedido.id}
                onClick={() => onEliminar(pedido)}
                className={`${styles.accion} ${styles.accionEliminar}`}
                aria-label={`Eliminar pedido #${pedido.numero}`}
              >
                <IconoEliminar />
                <span className={styles.textoAccion}>Eliminar</span>
              </button>
            ) : null}
          </div>
        </div>
      </motion.article>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>Se actualizan en vivo.</p>
        </div>
        <div className={styles.headControles}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
            />
            <span>Solo activos</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={sonido}
              onChange={alternarSonido}
            />
            <span>{sonido ? "Sonido on" : "Sonido off"}</span>
          </label>
        </div>
      </div>

      <div className={styles.tabs} role="group" aria-label="Filtrar pedidos">
        {(["todos", "domicilio", "restaurante", "mesero"] as Filtro[]).map(
          (t) => (
            <button
              key={t}
              type="button"
              className={`${styles.tab} ${filtro === t ? styles.tabActive : ""}`}
              onClick={() => {
                setFiltro(t);
                if (t === "domicilio") setMesaSeleccionada(null);
              }}
              aria-pressed={filtro === t}
            >
              {t === "todos" ? (
                "Todos"
              ) : t === "domicilio" ? (
                <>
                  <span aria-hidden>🛵</span> Domicilio
                </>
              ) : t === "restaurante" ? (
                <>
                  <span aria-hidden>🍽️</span> Restaurante
                </>
              ) : (
                <>
                  <span aria-hidden>🛎️</span> Mesero
                </>
              )}
              <span className={styles.tabCount}>{contar(t)}</span>
            </button>
          ),
        )}
      </div>

      {mesasResumen.length > 0 ? (
        <section className={styles.mesasAbiertas} aria-label="Mesas abiertas">
          <div className={styles.mesasAbiertasHead}>
            <h2 className={styles.seccionTitulo}>Mesas abiertas</h2>
            <div className={styles.mesasAcciones}>
              {mesaSeleccionada !== null ? (
                <button
                  type="button"
                  className={styles.controlMesas}
                  onClick={() => setMesaSeleccionada(null)}
                >
                  Ver todas
                </button>
              ) : null}
            </div>
          </div>
          <div className={styles.abiertasGrid}>
            <AnimatePresence initial={false}>
              {mesasResumen.map((sesion) => (
                <motion.article
                  key={sesion.id}
                  variants={entradaSalida}
                  initial="oculto"
                  animate="visible"
                  exit="salida"
                  transition={transicionSuave}
                  className={`${styles.abiertaCard} ${
                    mesaSeleccionada === sesion.mesa
                      ? styles.abiertaCardSeleccionada
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className={styles.abiertaSeleccion}
                    onClick={() => seleccionarMesa(sesion.mesa)}
                    aria-pressed={mesaSeleccionada === sesion.mesa}
                    aria-expanded={
                      mesasExpandidas && mesaSeleccionada === sesion.mesa
                    }
                    aria-controls="mesas-tickets"
                    aria-label={`${
                      mesasExpandidas && mesaSeleccionada === sesion.mesa
                        ? "Ocultar"
                        : "Ver"
                    } tickets de la mesa ${sesion.mesa}`}
                  >
                    <div className={styles.abiertaInfo}>
                      <strong>Mesa {sesion.mesa}</strong>
                      <span>{sesion.mesero_nombre}</span>
                      <span>
                        {sesion.tickets > 0
                          ? `${sesion.tickets} ${
                              sesion.tickets === 1 ? "ticket" : "tickets"
                            } · ${formatearPrecio(sesion.total)}`
                          : "Sin pedidos todavía"}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={styles.cerrarMesa}
                    disabled={cerrandoMesa === sesion.mesa}
                    onClick={() => onCerrarMesa(sesion.mesa)}
                  >
                    {cerrandoMesa === sesion.mesa ? "Cerrando…" : "Cerrar mesa"}
                  </button>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : null}

      {!hayPedidos && mesasResumen.length === 0 ? (
        <p className={styles.empty}>No hay pedidos por aquí.</p>
      ) : (
        <>
          <div id="mesas-tickets">
            <AnimatePresence initial={false}>
              {mesasExpandidas ? (
                <motion.div
                  key="mesas-wrap"
                  variants={variantesWrap}
                  initial="oculto"
                  animate="visible"
                  exit="salida"
                  transition={transicionSuave}
                  className={styles.mesasWrap}
                >
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={mesaSeleccionada ?? "todas"}
                      variants={entradaPantalla}
                      initial="oculto"
                      animate="visible"
                      exit="salida"
                      transition={transicionSuave}
                      className={styles.mesas}
                    >
                      {gruposVisibles.length > 0 ? (
                        <AnimatePresence initial={false}>
                          {gruposVisibles.map(({ mesa, tickets }) => {
                            const totalMesa = tickets.reduce(
                              (acc, t) => acc + t.total,
                              0,
                            );
                            return (
                              <motion.section
                                key={mesa}
                                variants={entradaSalida}
                                initial="oculto"
                                animate="visible"
                                exit="salida"
                                transition={transicionSuave}
                                className={styles.mesa}
                              >
                                <header className={styles.mesaHead}>
                                  <div className={styles.mesaInfo}>
                                    <h2 className={styles.mesaTitulo}>
                                      Mesa {mesa}
                                    </h2>
                                    <span className={styles.mesaMeta}>
                                      {tickets.length}{" "}
                                      {tickets.length === 1
                                        ? "ticket"
                                        : "tickets"}
                                    </span>
                                  </div>
                                  <div className={styles.mesaAcciones}>
                                    <span className={styles.mesaTotal}>
                                      Total mesa:{" "}
                                      <strong>{formatearPrecio(totalMesa)}</strong>
                                    </span>
                                    <button
                                      type="button"
                                      className={styles.cerrarMesa}
                                      disabled={cerrandoMesa === mesa}
                                      onClick={() => onCerrarMesa(mesa)}
                                    >
                                      {cerrandoMesa === mesa
                                        ? "Cerrando…"
                                        : "Cerrar mesa"}
                                    </button>
                                  </div>
                                </header>
                                <div className={styles.grid}>
                                  <AnimatePresence initial={false}>
                                    {tickets.map((pedido) =>
                                      renderPedido(pedido),
                                    )}
                                  </AnimatePresence>
                                </div>
                              </motion.section>
                            );
                          })}
                        </AnimatePresence>
                      ) : (
                        <p className={styles.empty}>
                          {mesaSeleccionada !== null
                            ? "Esta mesa todavía no tiene tickets."
                            : "No hay tickets de mesa activos."}
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {domicilio.length > 0 ? (
            <div className={styles.bloque}>
              {filtro === "todos" && gruposMesa.length > 0 ? (
                <h2 className={styles.seccionTitulo}>Domicilio</h2>
              ) : null}
              <div className={styles.grid}>
                <AnimatePresence initial={false}>
                  {domicilio.map((pedido) => renderPedido(pedido))}
                </AnimatePresence>
              </div>
            </div>
          ) : null}

          {restauranteHistorial.length > 0 ? (
            <div className={styles.bloque}>
              <h2 className={styles.seccionTitulo}>
                {filtro === "mesero"
                  ? "Mesero · historial"
                  : "Restaurante · historial"}
              </h2>
              <div className={styles.grid}>
                <AnimatePresence initial={false}>
                  {restauranteHistorial.map((pedido) => renderPedido(pedido))}
                </AnimatePresence>
              </div>
            </div>
          ) : null}

          {mesasCerradas.length > 0 ? (
            <section className={styles.bloque} aria-label="Mesas cerradas">
              <div className={styles.historialHead}>
                <h2 className={styles.seccionTitulo}>Mesas cerradas</h2>
                <button
                  type="button"
                  className={styles.borrarHistorial}
                  disabled={limpiando}
                  onClick={onLimpiarHistorial}
                >
                  {limpiando ? "Borrando…" : "Borrar historial"}
                </button>
              </div>
              <div className={styles.mesas}>
                <AnimatePresence initial={false}>
                  {mesasCerradas.map((sesion) => {
                    const total = sesion.pedidos.reduce(
                      (acc, pedido) => acc + pedido.total,
                      0,
                    );
                    const tickets = sesion.pedidos.length;

                    return (
                      <motion.section
                        key={sesion.id}
                        variants={entradaSalida}
                        initial="oculto"
                        animate="visible"
                        exit="salida"
                        transition={transicionSuave}
                        className={styles.mesa}
                      >
                        <header className={styles.mesaHead}>
                          <div className={styles.mesaInfo}>
                            <h2 className={styles.mesaTitulo}>
                              Mesa {sesion.mesa}
                            </h2>
                            <span className={styles.mesaMeta}>
                              {sesion.mesero_nombre} · Cerrada{" "}
                              {formatearHora(
                                sesion.cerrada_at ?? sesion.abierta_at,
                              )}{" "}
                              · {tickets}{" "}
                              {tickets === 1 ? "ticket" : "tickets"}
                            </span>
                          </div>
                          <span className={styles.mesaTotal}>
                            Total: <strong>{formatearPrecio(total)}</strong>
                          </span>
                        </header>
                        {tickets > 0 ? (
                          <div className={styles.grid}>
                            <AnimatePresence initial={false}>
                              {sesion.pedidos.map((pedido) =>
                                renderPedido(pedido, true),
                              )}
                            </AnimatePresence>
                          </div>
                        ) : (
                          <p className={styles.empty}>Sin tickets.</p>
                        )}
                      </motion.section>
                    );
                  })}
                </AnimatePresence>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
