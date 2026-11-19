"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { entradaSalida, transicionSuave } from "@/components/animacion";
import { createClient } from "@/lib/supabase/client";
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
import ImpresionPedido from "./ImpresionPedido";
import styles from "./pedidos.module.scss";

type Filtro = "todos" | TipoPedido | "mesero";

const ACTIVOS: EstadoPedido[] = ["nuevo", "en_preparacion", "listo", "en_camino"];

type AvisoPedido = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  origen: Pedido["origen"];
  mesa: number | null;
  cliente: string;
  total: number;
};

type PayloadPedido = {
  eventType: string;
  new: {
    id?: unknown;
    numero?: unknown;
    tipo?: unknown;
    origen?: unknown;
    mesa?: unknown;
    cliente_nombre?: unknown;
    total?: unknown;
  };
};

function Aviso({
  aviso,
  onCerrar,
}: {
  aviso: AvisoPedido;
  onCerrar: (id: string) => void;
}) {
  useEffect(() => {
    const temporizador = window.setTimeout(() => onCerrar(aviso.id), 6000);
    return () => window.clearTimeout(temporizador);
  }, [aviso.id, onCerrar]);

  return (
    <motion.div
      layout
      variants={entradaSalida}
      initial="oculto"
      animate="visible"
      exit="salida"
      transition={transicionSuave}
      className={styles.aviso}
    >
      <div className={styles.avisoCuerpo}>
        <strong>Pedido #{aviso.numero}</strong>
        <span>
          {aviso.tipo === "domicilio"
            ? "Domicilio"
            : aviso.mesa != null
              ? `Mesa ${aviso.mesa}`
              : "Restaurante"}
          {aviso.origen === "mesero" ? " · Mesero" : ""} · {aviso.cliente}
        </span>
      </div>
      <strong>{formatearPrecio(aviso.total)}</strong>
      <button
        type="button"
        className={styles.avisoCerrar}
        onClick={() => onCerrar(aviso.id)}
        aria-label="Cerrar aviso"
      >
        ×
      </button>
    </motion.div>
  );
}

function Avisos({
  avisos,
  onCerrar,
}: {
  avisos: AvisoPedido[];
  onCerrar: (id: string) => void;
}) {
  const audioRef = useRef<AudioContext | null>(null);
  const vistosRef = useRef<Set<string>>(new Set());
  const [sonido, setSonido] = useState(true);

  useEffect(() => {
    function desbloquear() {
      if (
        (!audioRef.current || audioRef.current.state === "closed") &&
        window.AudioContext
      ) {
        audioRef.current = new window.AudioContext();
      }
      if (audioRef.current?.state === "suspended") {
        void audioRef.current.resume().catch(() => {});
      }
    }

    window.addEventListener("pointerdown", desbloquear);
    window.addEventListener("keydown", desbloquear);
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
      const contexto = audioRef.current;
      if (contexto && contexto.state !== "closed") {
        void contexto.close().catch(() => {});
      }
      audioRef.current = null;
    };
  }, []);

  const reproducir = useCallback(() => {
    const contexto = audioRef.current;
    if (!contexto || contexto.state === "closed") return;
    if (contexto.state === "suspended") {
      void contexto.resume().catch(() => {});
    }

    const inicio = contexto.currentTime;
    [880, 1174].forEach((frecuencia, indice) => {
      const oscilador = contexto.createOscillator();
      const ganancia = contexto.createGain();
      const momento = inicio + indice * 0.16;

      oscilador.type = "sine";
      oscilador.frequency.value = frecuencia;
      ganancia.gain.setValueAtTime(0.0001, momento);
      ganancia.gain.exponentialRampToValueAtTime(0.12, momento + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, momento + 0.13);
      oscilador.connect(ganancia);
      ganancia.connect(contexto.destination);
      oscilador.start(momento);
      oscilador.stop(momento + 0.14);
    });
  }, []);

  useEffect(() => {
    for (const aviso of avisos) {
      if (vistosRef.current.has(aviso.id)) continue;
      vistosRef.current.add(aviso.id);
      if (sonido) reproducir();
    }
  }, [avisos, reproducir, sonido]);

  return (
    <div className={styles.avisos}>
      <button
        type="button"
        className={styles.avisoSonido}
        onClick={() => setSonido((actual) => !actual)}
        aria-label={sonido ? "Silenciar avisos" : "Activar sonido de avisos"}
      >
        {sonido ? "Sonido on" : "Sonido off"}
      </button>
      <AnimatePresence initial={false}>
        {avisos.map((aviso) => (
          <Aviso key={aviso.id} aviso={aviso} onCerrar={onCerrar} />
        ))}
      </AnimatePresence>
    </div>
  );
}

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
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [soloActivos, setSoloActivos] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [cerrandoMesa, setCerrandoMesa] = useState<number | null>(null);
  const [limpiando, setLimpiando] = useState(false);
  const [mesasPrevias, setMesasPrevias] = useState(mesasAbiertas);
  const [mesasOverride, setMesasOverride] = useState<MesaAbierta[] | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const [avisos, setAvisos] = useState<AvisoPedido[]>([]);
  const pedidosVistosRef = useRef<Set<string>>(new Set());

  const cerrarAviso = useCallback((id: string) => {
    setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== id));
  }, []);

  if (mesasAbiertas !== mesasPrevias) {
    setMesasPrevias(mesasAbiertas);
    setMesasOverride(null);
  }

  const mesasAbiertasLocales = mesasOverride ?? mesasAbiertas;

  useEffect(() => {
    const supabase = createClient("admin");
    let activo = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function suscribir() {
      const { data } = await supabase.auth.getSession();
      if (!activo) return;

      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }

      channel = supabase
        .channel("pedidos-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pedidos" },
          (payload: PayloadPedido) => {
            router.refresh();
            if (payload.eventType !== "INSERT") return;

            const fila = payload.new;
            const id = fila.id;
            const numero = fila.numero;
            if (
              typeof id !== "string" ||
              typeof numero !== "number" ||
              pedidosVistosRef.current.has(id)
            ) {
              return;
            }
            pedidosVistosRef.current.add(id);

            setAvisos((actuales) => [
              ...actuales,
              {
                id,
                numero,
                tipo: fila.tipo === "domicilio" ? "domicilio" : "restaurante",
                origen: fila.origen === "mesero" ? "mesero" : "cliente",
                mesa: typeof fila.mesa === "number" ? fila.mesa : null,
                cliente:
                  typeof fila.cliente_nombre === "string"
                    ? fila.cliente_nombre
                    : "Cliente",
                total: typeof fila.total === "number" ? fila.total : 0,
              },
            ]);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "mesas_abiertas" },
          () => router.refresh(),
        )
        .subscribe((status: string) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[admin realtime]", status);
          }
        });
    }

    function alVolver() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    void suscribir();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

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
        layout
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
                layout
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
              >
                Cancelar
              </button>
            ) : null}
            <ImpresionPedido pedido={pedido} className={styles.accion} />
            {!soloImprimir ? (
              <button
                type="button"
                disabled={procesando === pedido.id}
                onClick={() => onEliminar(pedido)}
                className={`${styles.accion} ${styles.accionEliminar}`}
              >
                Eliminar
              </button>
            ) : null}
          </div>
        </div>
      </motion.article>
    );
  }

  return (
    <div className={styles.page}>
      <Avisos avisos={avisos} onCerrar={cerrarAviso} />
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>Se actualizan en vivo.</p>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
          />
          <span>Solo activos</span>
        </label>
      </div>

      <div className={styles.tabs} role="group" aria-label="Filtrar pedidos">
        {(["todos", "domicilio", "restaurante", "mesero"] as Filtro[]).map(
          (t) => (
            <button
              key={t}
              type="button"
              className={`${styles.tab} ${filtro === t ? styles.tabActive : ""}`}
              onClick={() => setFiltro(t)}
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
          <h2 className={styles.seccionTitulo}>Mesas abiertas</h2>
          <div className={styles.abiertasGrid}>
            <AnimatePresence initial={false}>
              {mesasResumen.map((sesion) => (
                <motion.article
                  key={sesion.id}
                  layout
                  variants={entradaSalida}
                  initial="oculto"
                  animate="visible"
                  exit="salida"
                  transition={transicionSuave}
                  className={styles.abiertaCard}
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
          {gruposMesa.length > 0 ? (
            <div className={styles.mesas}>
              <AnimatePresence initial={false}>
                {gruposMesa.map(({ mesa, tickets }) => {
                  const totalMesa = tickets.reduce(
                    (acc, t) => acc + t.total,
                    0,
                  );
                  return (
                    <motion.section
                      key={mesa}
                      layout
                      variants={entradaSalida}
                      initial="oculto"
                      animate="visible"
                      exit="salida"
                      transition={transicionSuave}
                      className={styles.mesa}
                    >
                      <header className={styles.mesaHead}>
                        <div className={styles.mesaInfo}>
                          <h2 className={styles.mesaTitulo}>Mesa {mesa}</h2>
                          <span className={styles.mesaMeta}>
                            {tickets.length}{" "}
                            {tickets.length === 1 ? "ticket" : "tickets"}
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
                          {tickets.map((pedido) => renderPedido(pedido))}
                        </AnimatePresence>
                      </div>
                    </motion.section>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : null}

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
                        layout
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
