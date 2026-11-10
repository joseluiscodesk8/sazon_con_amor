"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatearPrecio } from "@/lib/format";
import {
  ESTADO_LABEL,
  formatearHora,
  type EstadoPedido,
  type MesaAbierta,
  type Pedido,
  type TipoPedido,
} from "@/lib/pedidos";
import { cancelarPedido, cerrarMesa, eliminarPedido } from "./pedidos-actions";
import ImpresionPedido from "./ImpresionPedido";
import styles from "./pedidos.module.scss";

type Filtro = "todos" | TipoPedido | "mesero";

const ACTIVOS: EstadoPedido[] = ["nuevo", "en_preparacion", "listo", "en_camino"];

export default function PedidosCliente({
  pedidos,
  mesasAbiertas,
}: {
  pedidos: Pedido[];
  mesasAbiertas: MesaAbierta[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [soloActivos, setSoloActivos] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [cerrandoMesa, setCerrandoMesa] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient("admin");
    const channel = supabase
      .channel("pedidos-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas_abiertas" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

  const restauranteHistorial = useMemo(
    () =>
      visibles.filter(
        (p) => p.tipo === "restaurante" && !ACTIVOS.includes(p.estado),
      ),
    [visibles],
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

    return mesasAbiertas
      .map((sesion) => ({
        ...sesion,
        total: totales.get(sesion.mesa) ?? 0,
        tickets: tickets.get(sesion.mesa) ?? 0,
      }))
      .sort((a, b) => a.mesa - b.mesa);
  }, [mesasAbiertas, pedidos]);

  const hayPedidos =
    gruposMesa.length > 0 ||
    restauranteHistorial.length > 0 ||
    domicilio.length > 0;

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
        `¿Cerrar la mesa ${mesa}? Se cerrarán sus pedidos activos y la mesa quedará libre.`,
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
      router.refresh();
      setCerrandoMesa(null);
    });
  }

  function renderPedido(pedido: Pedido) {
    const etiquetaTipo =
      pedido.tipo === "domicilio"
        ? "Domicilio"
        : pedido.origen === "mesero"
          ? "Mesero"
          : "Restaurante";

    return (
      <article key={pedido.id} className={styles.card}>
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
          {pedido.pedido_items.map((item) => (
            <li key={item.id}>
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
            </li>
          ))}
        </ul>

        {pedido.notas ? (
          <p className={styles.notas}>📝 {pedido.notas}</p>
        ) : null}

        <div className={styles.cardFooter}>
          <span className={styles.total}>
            Total: <strong>{formatearPrecio(pedido.total)}</strong>
          </span>
          <div className={styles.acciones}>
            {ACTIVOS.includes(pedido.estado) ? (
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
            <button
              type="button"
              disabled={procesando === pedido.id}
              onClick={() => onEliminar(pedido)}
              className={`${styles.accion} ${styles.accionEliminar}`}
            >
              Eliminar
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className={styles.page}>
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
            {mesasResumen.map((sesion) => (
              <article key={sesion.id} className={styles.abiertaCard}>
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
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!hayPedidos && mesasResumen.length === 0 ? (
        <p className={styles.empty}>No hay pedidos por aquí.</p>
      ) : (
        <>
          {gruposMesa.length > 0 ? (
            <div className={styles.mesas}>
              {gruposMesa.map(({ mesa, tickets }) => {
                const totalMesa = tickets.reduce((acc, t) => acc + t.total, 0);
                return (
                  <section key={mesa} className={styles.mesa}>
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
                          Total mesa: <strong>{formatearPrecio(totalMesa)}</strong>
                        </span>
                        <button
                          type="button"
                          className={styles.cerrarMesa}
                          disabled={cerrandoMesa === mesa}
                          onClick={() => onCerrarMesa(mesa)}
                        >
                          {cerrandoMesa === mesa ? "Cerrando…" : "Cerrar mesa"}
                        </button>
                      </div>
                    </header>
                    <div className={styles.grid}>{tickets.map(renderPedido)}</div>
                  </section>
                );
              })}
            </div>
          ) : null}

          {domicilio.length > 0 ? (
            <div className={styles.bloque}>
              {filtro === "todos" && gruposMesa.length > 0 ? (
                <h2 className={styles.seccionTitulo}>Domicilio</h2>
              ) : null}
              <div className={styles.grid}>{domicilio.map(renderPedido)}</div>
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
                {restauranteHistorial.map(renderPedido)}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
