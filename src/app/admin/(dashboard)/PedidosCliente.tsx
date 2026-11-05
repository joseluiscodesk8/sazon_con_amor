"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatearPrecio } from "@/lib/format";
import {
  ESTADO_LABEL,
  estadosSiguientes,
  formatearHora,
  type EstadoPedido,
  type Pedido,
  type TipoPedido,
} from "@/lib/pedidos";
import { cambiarEstado, cerrarMesa } from "./pedidos-actions";
import styles from "./pedidos.module.scss";

type Filtro = "todos" | TipoPedido;

const ACTIVOS: EstadoPedido[] = ["nuevo", "en_preparacion", "listo", "en_camino"];

export default function PedidosCliente({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [soloActivos, setSoloActivos] = useState(true);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [cerrandoMesa, setCerrandoMesa] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const visibles = useMemo(() => {
    let lista = pedidos;
    if (filtro !== "todos") lista = lista.filter((p) => p.tipo === filtro);
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

  const hayPedidos =
    gruposMesa.length > 0 ||
    restauranteHistorial.length > 0 ||
    domicilio.length > 0;

  const contar = (tipo: Filtro) =>
    pedidos.filter((p) => (tipo === "todos" ? true : p.tipo === tipo)).length;

  function onCambiarEstado(pedidoId: string, estado: EstadoPedido) {
    setActualizando(pedidoId);
    startTransition(async () => {
      const res = await cambiarEstado(pedidoId, estado);
      if (!res.ok) {
        setActualizando(null);
        alert(res.error);
        return;
      }
      router.refresh();
      setActualizando(null);
    });
  }

  function onCerrarMesa(mesa: number, tickets: number) {
    if (
      !confirm(
        `¿Cerrar la mesa ${mesa}? Se marcarán ${tickets} ticket(s) como entregados.`,
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
    return (
      <article key={pedido.id} className={styles.card}>
        <header className={styles.cardHead}>
          <div>
            <span className={styles.numero}>#{pedido.numero}</span>
            <span
              className={`${styles.tipoBadge} ${
                pedido.tipo === "domicilio"
                  ? styles.tipoDomicilio
                  : styles.tipoRestaurante
              }`}
            >
              {pedido.tipo === "domicilio" ? "Domicilio" : "Restaurante"}
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
          <span>👤 {pedido.cliente_nombre}</span>
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
        </div>

        {estadosSiguientes(pedido.tipo, pedido.estado).length > 0 ? (
          <div className={styles.acciones}>
            {estadosSiguientes(pedido.tipo, pedido.estado).map((estado) => (
              <button
                key={estado}
                type="button"
                disabled={actualizando === pedido.id}
                onClick={() => onCambiarEstado(pedido.id, estado)}
                className={`${styles.accion} ${
                  estado === "cancelado" ? styles.accionCancelar : ""
                }`}
              >
                {estado === "cancelado"
                  ? "Cancelar"
                  : `→ ${ESTADO_LABEL[estado]}`}
              </button>
            ))}
          </div>
        ) : null}
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
        {(["todos", "domicilio", "restaurante"] as Filtro[]).map((t) => (
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
            ) : (
              <>
                <span aria-hidden>🍽️</span> Restaurante
              </>
            )}
            <span className={styles.tabCount}>{contar(t)}</span>
          </button>
        ))}
      </div>

      {!hayPedidos ? (
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
                          onClick={() => onCerrarMesa(mesa, tickets.length)}
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
              <h2 className={styles.seccionTitulo}>Restaurante · historial</h2>
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
