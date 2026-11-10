"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Dialogo from "@/components/Dialogo";
import { createClient } from "@/lib/supabase/client";
import { formatearPrecio } from "@/lib/format";
import {
  ESTADO_LABEL,
  formatearHora,
  type EstadoPedido,
  type MesaAbierta,
  type Pedido,
} from "@/lib/pedidos";
import type { Adicion, Menu, Plato } from "@/app/menu/data";
import { abrirMesa as abrirMesaAction, guardarPedidoMesa } from "../actions";
import styles from "./mesero.module.scss";

type Props = {
  menu: Menu;
  pedidos: Pedido[];
  mesasAbiertas: MesaAbierta[];
  mesero: string;
  meseroId: string;
};

type Seleccion = {
  subcategoria_id: string;
  subcategoria: string;
  opcion_id: string;
  opcion: string;
};

type Linea = {
  key: string;
  platoId: string;
  cantidad: number;
  opciones: Seleccion[];
  adiciones: Adicion[];
};

type Vista = "mesas" | "pedido" | "mesa";

const ACTIVOS: EstadoPedido[] = ["nuevo", "en_preparacion", "listo"];
const MESAS = Array.from({ length: 60 }, (_, indice) => indice + 1);

function claveLinea(
  platoId: string,
  opciones: Seleccion[],
  adiciones: Adicion[],
) {
  const firmaOpciones = opciones
    .map((opcion) => `${opcion.subcategoria_id}:${opcion.opcion_id}`)
    .sort()
    .join("|");
  const firmaAdiciones = adiciones
    .map((adicion) => adicion.id)
    .sort()
    .join("|");
  return `${platoId}#${firmaOpciones}#${firmaAdiciones}`;
}

function sumarAdiciones(adiciones: Adicion[]) {
  return adiciones.reduce((total, adicion) => total + adicion.precio, 0);
}

function precioLinea(plato: Plato | undefined, linea: Linea) {
  if (!plato) return 0;
  return (plato.precio + sumarAdiciones(linea.adiciones)) * linea.cantidad;
}

function nombreMesa(numero: number) {
  return `Mesa ${numero}`;
}

export default function MeseroCliente({
  menu,
  pedidos,
  mesasAbiertas,
  mesero,
  meseroId,
}: Props) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("mesas");
  const [mesa, setMesa] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Record<string, Linea>>({});
  const [notas, setNotas] = useState("");
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [platoAbierto, setPlatoAbierto] = useState<Plato | null>(null);
  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const [adicionesSel, setAdicionesSel] = useState<string[]>([]);
  const [abriendoMesa, setAbriendoMesa] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotenciaRef = useRef<string | null>(null);
  const teniaSesionRef = useRef(false);

  useEffect(() => {
    const supabase = createClient("mesero");
    const channel = supabase
      .channel("mesero-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
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

  useEffect(() => {
    idempotenciaRef.current = null;
  }, [lineas, notas, mesa]);

  const platosPorId = useMemo(() => {
    const mapa = new Map<string, Plato>();
    menu.forEach((categoria) =>
      categoria.platos.forEach((plato) => mapa.set(plato.id, plato)),
    );
    return mapa;
  }, [menu]);

  const sesionesPorMesa = useMemo(
    () =>
      new Map(
        mesasAbiertas.map((sesion) => [sesion.mesa, sesion] as const),
      ),
    [mesasAbiertas],
  );

  const sesionActual = mesa != null ? sesionesPorMesa.get(mesa) : undefined;
  const puedoOperar = sesionActual?.mesero_user_id === meseroId;

  const pedidosActivosPorMesa = useMemo(() => {
    const mapa = new Map<number, Pedido>();

    for (const pedido of pedidos) {
      if (
        pedido.tipo !== "restaurante" ||
        pedido.origen !== "mesero" ||
        pedido.mesa == null ||
        !ACTIVOS.includes(pedido.estado)
      ) {
        continue;
      }

      const actual = mapa.get(pedido.mesa);
      if (!actual || pedido.created_at > actual.created_at) {
        mapa.set(pedido.mesa, pedido);
      }
    }

    return mapa;
  }, [pedidos]);

  const pedidoActual =
    mesa != null ? (pedidosActivosPorMesa.get(mesa) ?? null) : null;

  useEffect(() => {
    if (vista === "mesas" || mesa == null) {
      teniaSesionRef.current = false;
      return;
    }

    if (sesionActual?.mesero_user_id === meseroId) {
      teniaSesionRef.current = true;
      return;
    }

    if (!teniaSesionRef.current) return;

    teniaSesionRef.current = false;
    setMesa(null);
    setVista("mesas");
    setLineas({});
    setNotas("");
    setCarritoAbierto(false);
    setPlatoAbierto(null);
    setSelecciones({});
    setAdicionesSel([]);
    setError(
      sesionActual
        ? "La mesa fue abierta por otro mesero."
        : "La mesa fue cerrada.",
    );
  }, [mesa, meseroId, sesionActual, vista]);

  const lineasTotales = useMemo(() => Object.values(lineas), [lineas]);

  const cantidadTotal = useMemo(
    () => lineasTotales.reduce((total, linea) => total + linea.cantidad, 0),
    [lineasTotales],
  );

  const total = useMemo(
    () =>
      lineasTotales.reduce(
        (suma, linea) =>
          suma + precioLinea(platosPorId.get(linea.platoId), linea),
        0,
      ),
    [lineasTotales, platosPorId],
  );

  function limpiarCarrito() {
    setLineas({});
    setCarritoAbierto(false);
    setPlatoAbierto(null);
    setSelecciones({});
    setAdicionesSel([]);
  }

  function volverAMesas() {
    if (
      cantidadTotal > 0 &&
      !confirm("¿Salir sin enviar los platos del carrito?")
    ) {
      return;
    }

    limpiarCarrito();
    setMesa(null);
    setVista("mesas");
    setNotas("");
    setError(null);
    setExito(null);
  }

  function entrarMesa(numero: number) {
    const sesion = sesionesPorMesa.get(numero);
    if (!sesion || sesion.mesero_user_id !== meseroId) return;

    if (
      cantidadTotal > 0 &&
      !confirm("Se perderán los platos del carrito. ¿Cambiar de mesa?")
    ) {
      return;
    }

    limpiarCarrito();
    setMesa(numero);
    setVista("pedido");
    setNotas(pedidosActivosPorMesa.get(numero)?.notas ?? "");
    setError(null);
    setExito(null);
  }

  function abrirMesa(numero: number) {
    if (abriendoMesa !== null || pending) return;

    setError(null);
    setExito(null);
    setAbriendoMesa(numero);
    teniaSesionRef.current = false;

    startTransition(async () => {
      try {
        const res = await abrirMesaAction({ mesa: numero });
        if (!res.ok) {
          setError(res.error);
          router.refresh();
          return;
        }

        limpiarCarrito();
        setMesa(numero);
        setVista("pedido");
        setNotas(pedidosActivosPorMesa.get(numero)?.notas ?? "");
        router.refresh();
      } catch {
        setError("No se pudo abrir la mesa. Intenta de nuevo.");
        router.refresh();
      } finally {
        setAbriendoMesa(null);
      }
    });
  }

  function opcionesDe(plato: Plato): Seleccion[] {
    return plato.subcategorias
      .map((subcategoria) => {
        const opcionId = selecciones[subcategoria.id];
        const opcion = subcategoria.opciones.find((o) => o.id === opcionId);
        if (!opcion) return null;
        return {
          subcategoria_id: subcategoria.id,
          subcategoria: subcategoria.nombre,
          opcion_id: opcion.id,
          opcion: opcion.nombre,
        };
      })
      .filter((opcion): opcion is Seleccion => opcion !== null);
  }

  function abrirPlato(plato: Plato) {
    const iniciales: Record<string, string> = {};
    for (const subcategoria of plato.subcategorias) {
      iniciales[subcategoria.id] = subcategoria.opciones[0]?.id ?? "";
    }

    setSelecciones(iniciales);
    setAdicionesSel([]);
    setPlatoAbierto(plato);
  }

  function agregarLinea(
    platoId: string,
    opciones: Seleccion[],
    adiciones: Adicion[],
  ) {
    const key = claveLinea(platoId, opciones, adiciones);
    setLineas((prev) => {
      const actual = prev[key];
      if (actual) {
        return {
          ...prev,
          [key]: {
            ...actual,
            cantidad: Math.min(20, actual.cantidad + 1),
          },
        };
      }
      return {
        ...prev,
        [key]: { key, platoId, cantidad: 1, opciones, adiciones },
      };
    });
    setExito(null);
  }

  function agregarRapido(plato: Plato) {
    if (plato.subcategorias.length > 0 || plato.adiciones.length > 0) {
      abrirPlato(plato);
      return;
    }
    agregarLinea(plato.id, [], []);
  }

  function agregarDesdeModal() {
    if (!platoAbierto) return;

    const adiciones = platoAbierto.adiciones.filter((adicion) =>
      adicionesSel.includes(adicion.id),
    );

    agregarLinea(platoAbierto.id, opcionesDe(platoAbierto), adiciones);
    setPlatoAbierto(null);
  }

  function ajustarCantidad(key: string, delta: number) {
    setLineas((prev) => {
      const actual = prev[key];
      if (!actual) return prev;

      const cantidad = Math.max(0, Math.min(20, actual.cantidad + delta));
      if (cantidad === 0) {
        const copia = { ...prev };
        delete copia[key];
        return copia;
      }

      return { ...prev, [key]: { ...actual, cantidad } };
    });
    setExito(null);
  }

  function fijarCantidad(key: string, valor: number) {
    if (!Number.isFinite(valor)) return;

    setLineas((prev) => {
      const actual = prev[key];
      if (!actual) return prev;

      const cantidad = Math.max(0, Math.min(20, Math.floor(valor)));
      if (cantidad === 0) {
        const copia = { ...prev };
        delete copia[key];
        return copia;
      }

      return { ...prev, [key]: { ...actual, cantidad } };
    });
    setExito(null);
  }

  function enviarPedido() {
    setError(null);
    setExito(null);

    const mesaActual = mesa;
    if (mesaActual == null || !sesionActual) {
      setError("La mesa no está abierta.");
      return;
    }
    if (sesionActual.mesero_user_id !== meseroId) {
      setError("La mesa está abierta por otro mesero.");
      return;
    }
    if (lineasTotales.length === 0) {
      setError("Agrega al menos un plato.");
      return;
    }

    const items = lineasTotales.map((linea) => ({
      plato_id: linea.platoId,
      cantidad: linea.cantidad,
      opciones: linea.opciones.map((opcion) => ({
        subcategoria_id: opcion.subcategoria_id,
        opcion_id: opcion.opcion_id,
      })),
      adiciones: linea.adiciones.map((adicion) => ({
        adicion_id: adicion.id,
      })),
    }));

    startTransition(async () => {
      const idempotencia = idempotenciaRef.current ?? crypto.randomUUID();
      idempotenciaRef.current = idempotencia;

      try {
        const res = await guardarPedidoMesa({
          mesa: mesaActual,
          notas,
          idempotencia,
          items,
        });

        if (!res.ok) {
          setError(res.error);
          return;
        }

        idempotenciaRef.current = null;
        limpiarCarrito();
        setExito(
          res.creado
            ? `Pedido #${res.numero} creado.`
            : `Agregado al ticket #${res.numero}.`,
        );
        setVista("mesa");
        router.refresh();
      } catch {
        setError("No pudimos registrar el pedido. Intenta de nuevo.");
      }
    });
  }

  const precioModal = platoAbierto
    ? platoAbierto.precio +
      platoAbierto.adiciones
        .filter((adicion) => adicionesSel.includes(adicion.id))
        .reduce((suma, adicion) => suma + adicion.precio, 0)
    : 0;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            {vista === "mesas" ? "Mesas" : nombreMesa(mesa ?? 0)}
          </h1>
          <p className={styles.subtitle}>
            {vista === "mesas"
              ? `${mesero} · elige una mesa libre o entra a una tuya.`
              : `${sesionActual?.mesero_nombre ?? mesero} · ${
                  pedidoActual
                    ? `Ticket #${pedidoActual.numero}`
                    : "Sin ticket todavía"
                }`}
          </p>
        </div>

        {vista !== "mesas" ? (
          <button
            type="button"
            className={styles.secundario}
            onClick={volverAMesas}
          >
            ← Volver a mesas
          </button>
        ) : null}
      </div>

      {exito ? (
        <p className={styles.exito} role="status">
          {exito}
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {vista === "mesas" ? (
        <section className={styles.mesasPanel} aria-label="Mesas">
          <div className={styles.mesasGrid}>
            {MESAS.map((numero) => {
              const sesion = sesionesPorMesa.get(numero);
              const propia = sesion?.mesero_user_id === meseroId;
              const ocupada = Boolean(sesion && !propia);
              const resumen = pedidosActivosPorMesa.get(numero);
              const abriendo = abriendoMesa === numero;

              return (
                <button
                  key={numero}
                  type="button"
                  className={`${styles.mesaCard} ${
                    propia
                      ? styles.mesaCardMia
                      : ocupada
                        ? styles.mesaCardOcupada
                        : styles.mesaCardLibre
                  }`}
                  onClick={() => {
                    if (propia) {
                      entrarMesa(numero);
                    } else if (!sesion) {
                      abrirMesa(numero);
                    }
                  }}
                  disabled={ocupada || abriendoMesa !== null}
                  aria-label={
                    propia
                      ? `Mesa ${numero}, tu mesa`
                      : ocupada
                        ? `Mesa ${numero}, ocupada por ${sesion?.mesero_nombre}`
                        : `Abrir mesa ${numero}`
                  }
                >
                  <span className={styles.mesaNumero}>Mesa {numero}</span>
                  <span className={styles.mesaEstado}>
                    {propia
                      ? "Tu mesa"
                      : ocupada
                        ? sesion?.mesero_nombre
                        : abriendo
                          ? "Abriendo…"
                          : "Libre"}
                  </span>
                  {propia && resumen ? (
                    <span className={styles.mesaTotal}>
                      {formatearPrecio(resumen.total)}
                    </span>
                  ) : null}
                  {!sesion ? (
                    <span className={styles.mesaAccion}>
                      {abriendo ? "Abriendo…" : "Abrir"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <div className={styles.vistas} role="group" aria-label="Vista de mesero">
            <button
              type="button"
              className={`${styles.vista} ${
                vista === "pedido" ? styles.vistaActiva : ""
              }`}
              onClick={() => setVista("pedido")}
              aria-pressed={vista === "pedido"}
            >
              Menú
            </button>
            <button
              type="button"
              className={`${styles.vista} ${
                vista === "mesa" ? styles.vistaActiva : ""
              }`}
              onClick={() => setVista("mesa")}
              aria-pressed={vista === "mesa"}
            >
              Ticket
              {pedidoActual ? <span className={styles.contador}>1</span> : null}
            </button>
          </div>

          {!puedoOperar ? (
            <p className={styles.avisoMesa}>
              {sesionActual
                ? "La mesa está abierta por otro mesero."
                : "Cargando la mesa…"}
            </p>
          ) : vista === "pedido" ? (
            <>
              {pedidoActual ? (
                <p className={styles.avisoMesa}>
                  Los platos nuevos se agregarán al ticket #
                  {pedidoActual.numero} (
                  {formatearPrecio(pedidoActual.total)}).
                </p>
              ) : null}

              {menu.map((categoria) => (
                <section key={categoria.id} className={styles.categoria}>
                  <h2>{categoria.nombre}</h2>
                  <div className={styles.grid}>
                    {categoria.platos.map((plato) => (
                      <article key={plato.id} className={styles.plato}>
                        <div>
                          <h3>{plato.nombre}</h3>
                          {plato.descripcion ? (
                            <p>{plato.descripcion}</p>
                          ) : null}
                          <strong>{formatearPrecio(plato.precio)}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => agregarRapido(plato)}
                          aria-label={`Agregar ${plato.nombre}`}
                        >
                          {plato.subcategorias.length > 0 ||
                          plato.adiciones.length > 0
                            ? "Elegir"
                            : "Agregar"}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <section className={styles.mesaActual}>
              <div className={styles.mesaHead}>
                <div>
                  <h2>
                    {pedidoActual
                      ? `Ticket #${pedidoActual.numero}`
                      : "Ticket de la mesa"}
                  </h2>
                  <p>
                    {pedidoActual
                      ? `${ESTADO_LABEL[pedidoActual.estado]} · ${formatearHora(
                          pedidoActual.created_at,
                        )} · ${formatearPrecio(pedidoActual.total)}`
                      : "Aún no hay un ticket para esta mesa."}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.secundario}
                  onClick={() => setVista("pedido")}
                >
                  Agregar más platos
                </button>
              </div>

              {!pedidoActual ? (
                <p className={styles.vacio}>
                  Esta mesa no tiene pedidos activos.
                </p>
              ) : (
                <div className={styles.pedidosGrid}>
                  <article className={styles.pedido}>
                    <header>
                      <strong>#{pedidoActual.numero}</strong>
                      <span
                        className={styles.estado}
                        data-estado={pedidoActual.estado}
                      >
                        {ESTADO_LABEL[pedidoActual.estado]}
                      </span>
                    </header>
                    <p className={styles.pedidoMeta}>
                      {formatearHora(pedidoActual.created_at)}
                      {pedidoActual.mesero_nombre
                        ? ` · ${pedidoActual.mesero_nombre}`
                        : null}
                    </p>
                    <ul>
                      {pedidoActual.pedido_items.map((item) => (
                        <li key={item.id}>
                          <span>
                            <strong>{item.cantidad}×</strong> {item.nombre}
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
                          </span>
                          <span>
                            {formatearPrecio(item.precio * item.cantidad)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {pedidoActual.notas ? (
                      <p className={styles.notas}>{pedidoActual.notas}</p>
                    ) : null}
                    <footer>
                      <span>Total</span>
                      <strong>{formatearPrecio(pedidoActual.total)}</strong>
                    </footer>
                  </article>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {vista !== "mesas" && puedoOperar ? (
        <div className={styles.barra}>
          <button
            type="button"
            className={styles.verPedido}
            onClick={() => setCarritoAbierto(true)}
            aria-haspopup="dialog"
            aria-expanded={carritoAbierto}
            aria-controls="mesero-carrito"
          >
            <span>
              {pedidoActual ? "Nuevos platos" : "Ver pedido"}
              {cantidadTotal > 0 ? (
                <span className={styles.badge}>{cantidadTotal}</span>
              ) : null}
            </span>
            <strong>{formatearPrecio(total)}</strong>
          </button>
        </div>
      ) : null}

      {platoAbierto ? (
        <Dialogo
          id="mesero-plato"
          etiquetadoPor="mesero-plato-titulo"
          onCerrar={() => setPlatoAbierto(null)}
          overlayClassName={styles.overlay}
          panelClassName={styles.modal}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              agregarDesdeModal();
            }}
          >
            <div className={styles.modalHead}>
              <div>
                <h2 id="mesero-plato-titulo">{platoAbierto.nombre}</h2>
                {platoAbierto.descripcion ? (
                  <p>{platoAbierto.descripcion}</p>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.cerrar}
                onClick={() => setPlatoAbierto(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {platoAbierto.subcategorias.map((subcategoria) => (
              <fieldset key={subcategoria.id} className={styles.grupo}>
                <legend>{subcategoria.nombre}</legend>
                <div className={styles.opciones}>
                  {subcategoria.opciones.map((opcion) => (
                    <label key={opcion.id} className={styles.opcion}>
                      <input
                        type="radio"
                        name={`sub-${subcategoria.id}`}
                        checked={selecciones[subcategoria.id] === opcion.id}
                        onChange={() =>
                          setSelecciones((prev) => ({
                            ...prev,
                            [subcategoria.id]: opcion.id,
                          }))
                        }
                      />
                      <span>{opcion.nombre}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {platoAbierto.adiciones.length > 0 ? (
              <fieldset className={styles.grupo}>
                <legend>Adiciones</legend>
                <div className={styles.opciones}>
                  {platoAbierto.adiciones.map((adicion) => (
                    <label key={adicion.id} className={styles.opcion}>
                      <input
                        type="checkbox"
                        checked={adicionesSel.includes(adicion.id)}
                        onChange={(event) =>
                          setAdicionesSel((prev) =>
                            event.target.checked
                              ? [...prev, adicion.id]
                              : prev.filter((id) => id !== adicion.id),
                          )
                        }
                      />
                      <span>
                        {adicion.nombre} · {formatearPrecio(adicion.precio)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <button type="submit" className={styles.primario}>
              Agregar · {formatearPrecio(precioModal)}
            </button>
          </form>
        </Dialogo>
      ) : null}

      {carritoAbierto ? (
        <Dialogo
          id="mesero-carrito"
          etiquetadoPor="mesero-carrito-titulo"
          onCerrar={() => {
            if (!pending) setCarritoAbierto(false);
          }}
          overlayClassName={styles.overlay}
          panelClassName={styles.modal}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              enviarPedido();
            }}
          >
            <div className={styles.modalHead}>
              <div>
                <h2 id="mesero-carrito-titulo">
                  {pedidoActual ? "Nuevos platos" : "Pedido de la mesa"}
                </h2>
                <p>
                  {mesa ? nombreMesa(mesa) : "Mesa"} · {mesero}
                  {pedidoActual ? ` · Ticket #${pedidoActual.numero}` : ""}
                </p>
              </div>
              <button
                type="button"
                className={styles.cerrar}
                onClick={() => setCarritoAbierto(false)}
                aria-label="Cerrar"
                disabled={pending}
              >
                ×
              </button>
            </div>

            {pedidoActual ? (
              <p className={styles.avisoMesa}>
                Se agregarán al ticket #{pedidoActual.numero}, que ya tiene{" "}
                {pedidoActual.pedido_items.length} ítem(s) y un total de{" "}
                {formatearPrecio(pedidoActual.total)}.
              </p>
            ) : null}

            {lineasTotales.length === 0 ? (
              <p className={styles.vacio}>El pedido está vacío.</p>
            ) : (
              <ul className={styles.lineas}>
                {lineasTotales.map((linea) => {
                  const plato = platosPorId.get(linea.platoId);
                  return (
                    <li key={linea.key}>
                      <div>
                        <strong>{plato?.nombre ?? "Plato"}</strong>
                        {linea.opciones.length > 0 ? (
                          <small>
                            {linea.opciones
                              .map(
                                (opcion) =>
                                  `${opcion.subcategoria}: ${opcion.opcion}`,
                              )
                              .join(" · ")}
                          </small>
                        ) : null}
                        {linea.adiciones.length > 0 ? (
                          <small>
                            {linea.adiciones
                              .map((adicion) => `+ ${adicion.nombre}`)
                              .join(" · ")}
                          </small>
                        ) : null}
                      </div>
                      <div className={styles.lineaAcciones}>
                        <span>{formatearPrecio(precioLinea(plato, linea))}</span>
                        <div className={styles.cantidadControl}>
                          <button
                            type="button"
                            onClick={() => ajustarCantidad(linea.key, -1)}
                            disabled={pending}
                            aria-label={`Quitar uno de ${plato?.nombre ?? "plato"}`}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={linea.cantidad}
                            onChange={(event) => {
                              const valor = event.target.valueAsNumber;
                              if (Number.isFinite(valor)) {
                                fijarCantidad(linea.key, valor);
                              }
                            }}
                            disabled={pending}
                            aria-label={`Cantidad de ${plato?.nombre ?? "plato"}`}
                          />
                          <button
                            type="button"
                            onClick={() => ajustarCantidad(linea.key, 1)}
                            disabled={pending}
                            aria-label={`Agregar uno de ${plato?.nombre ?? "plato"}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <label className={styles.campoAncho}>
              <span>Nota general del pedido</span>
              <textarea
                value={notas}
                onChange={(event) => setNotas(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Sin cebolla, sin salsa…"
                disabled={pending}
              />
            </label>

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            <div className={styles.resumen}>
              <span>
                {pedidoActual ? "Nuevos platos" : "Total"}{" "}
                <strong>{formatearPrecio(total)}</strong>
              </span>
              <button
                type="submit"
                className={styles.primario}
                disabled={
                  pending || lineasTotales.length === 0 || !puedoOperar
                }
              >
                {pending
                  ? "Guardando…"
                  : pedidoActual
                    ? "Agregar al ticket"
                    : "Enviar pedido"}
              </button>
            </div>
          </form>
        </Dialogo>
      ) : null}
    </div>
  );
}
