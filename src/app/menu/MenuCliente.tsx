"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatearPrecio } from "@/lib/format";
import {
  ESTADO_LABEL,
  type EstadoPedido,
} from "@/lib/pedidos";
import { actualizarPedido, crearPedido, estadoPedido } from "./actions";
import type { Adicion, Lugar, Menu, Plato } from "./data";
import styles from "./menu.module.scss";

type Modo = "domicilio" | "restaurante";

type Props = {
  modo: Modo;
  menu: Menu;
  lugares?: Lugar[];
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

type DatosEnvio = {
  nombre: string;
  telefono: string;
  direccion: string;
  lugar: string;
};

type PedidoGuardado = {
  token: string;
  datos: DatosEnvio & { notas: string };
  lineas: Linea[];
};

type Resultado = {
  total: number;
  editado: boolean;
};

type Seguimiento = {
  estado: EstadoPedido;
  segundosRestantes: number;
  total: number;
  creadoEn: string;
};

const CLAVE_DATOS = "sazon_datos_envio";
const CLAVE_PEDIDO = "sazon_pedido_actual";

const DATOS_VACIOS: DatosEnvio = {
  nombre: "",
  telefono: "",
  direccion: "",
  lugar: "",
};

const PASOS_DOMICILIO: EstadoPedido[] = [
  "nuevo",
  "en_preparacion",
  "listo",
  "en_camino",
  "entregado",
];

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function claveLinea(
  platoId: string,
  opciones: Seleccion[],
  adiciones: Adicion[],
): string {
  const firmaOpciones = opciones
    .map((o) => `${o.subcategoria_id}:${o.opcion_id}`)
    .sort()
    .join("|");
  const firmaAdiciones = adiciones
    .map((a) => a.id)
    .sort()
    .join("|");
  return `${platoId}#${firmaOpciones}#${firmaAdiciones}`;
}

function sumarAdiciones(adiciones: Adicion[]) {
  return adiciones.reduce((acc, adicion) => acc + adicion.precio, 0);
}

function precioLinea(plato: Plato | undefined, linea: Linea) {
  if (!plato) return 0;
  return (plato.precio + sumarAdiciones(linea.adiciones)) * linea.cantidad;
}

function formatearCuenta(segundos: number) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

function textoEstado(
  estado: EstadoPedido | null,
  segundos: number,
): string {
  if (!estado) return "Actualizando el estado de tu pedido…";
  if (estado === "nuevo") {
    return segundos > 0
      ? "Puedes modificarlo durante los primeros 5 minutos."
      : "El tiempo para modificarlo terminó.";
  }
  if (estado === "en_preparacion") return "Ya está en preparación.";
  if (estado === "listo") return "Está listo.";
  if (estado === "en_camino") return "Va en camino.";
  if (estado === "entregado") return "Entregado. ¡Buen provecho!";
  return "El pedido fue cancelado.";
}

export default function MenuCliente({ modo, menu, lugares = [] }: Props) {
  const [carrito, setCarrito] = useState<Record<string, Linea>>({});
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selecciones, setSelecciones] = useState<
    Record<string, Record<string, string>>
  >({});
  const [adicionesSel, setAdicionesSel] = useState<Record<string, string[]>>(
    {},
  );

  const esDomicilio = modo === "domicilio";

  const [datos, setDatos] = useState<DatosEnvio>(DATOS_VACIOS);
  const [notas, setNotas] = useState("");
  const [mesa, setMesa] = useState("");
  const [guardarDatos, setGuardarDatos] = useState(true);
  const [tieneDatosGuardados, setTieneDatosGuardados] = useState(false);
  const [lugaresAbierto, setLugaresAbierto] = useState(false);
  const [pedidoGuardado, setPedidoGuardado] = useState<PedidoGuardado | null>(
    null,
  );
  const [editando, setEditando] = useState(false);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [verSeguimiento, setVerSeguimiento] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [refresco, setRefresco] = useState(0);

  // Prellenado único desde localStorage (sistema externo). Se desactiva la
  // regla porque este setState es intencional y ocurre una sola vez al montar.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!esDomicilio) return;

    try {
      const rawDatos = window.localStorage.getItem(CLAVE_DATOS);
      if (rawDatos) {
        const guardados = JSON.parse(rawDatos) as Partial<DatosEnvio>;
        setDatos((prev) => ({
          nombre: prev.nombre || guardados.nombre || "",
          telefono: prev.telefono || guardados.telefono || "",
          direccion: prev.direccion || guardados.direccion || "",
          lugar: prev.lugar || guardados.lugar || "",
        }));
        setTieneDatosGuardados(true);
      }

      const rawPedido = window.localStorage.getItem(CLAVE_PEDIDO);
      if (rawPedido) {
        const guardado = JSON.parse(rawPedido) as PedidoGuardado;
        if (guardado?.token && Array.isArray(guardado.lineas)) {
          setPedidoGuardado({
            token: guardado.token,
            datos: { ...DATOS_VACIOS, ...guardado.datos },
            lineas: guardado.lineas.map((linea) => {
              const opciones = linea.opciones ?? [];
              const adiciones = linea.adiciones ?? [];
              return {
                ...linea,
                opciones,
                adiciones,
                key: claveLinea(linea.platoId, opciones, adiciones),
              };
            }),
          });
        }
      }
    } catch {
      // Datos corruptos en el navegador: se ignoran.
    }
  }, [esDomicilio]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const token = pedidoGuardado?.token ?? null;
  const estado = seguimiento?.estado ?? null;

  useEffect(() => {
    if (!esDomicilio || !token) return;
    if (estado === "entregado" || estado === "cancelado") return;

    let activo = true;

    async function consultar() {
      const res = await estadoPedido(token as string);
      if (!activo) return;

      if (res.ok) {
        setAviso(null);
        setSeguimiento({
          estado: res.estado,
          segundosRestantes: res.segundosRestantes,
          total: res.total,
          creadoEn: res.creadoEn,
        });
        setSegundos(res.segundosRestantes);
      } else {
        setAviso(res.error);
      }
    }

    consultar();
    const intervalo = window.setInterval(consultar, 20000);

    return () => {
      activo = false;
      window.clearInterval(intervalo);
    };
  }, [esDomicilio, token, estado, refresco]);

  useEffect(() => {
    if (estado !== "nuevo" || segundos <= 0) return;

    const temporizador = window.setTimeout(() => {
      setSegundos((actual) => Math.max(0, actual - 1));
    }, 1000);

    return () => window.clearTimeout(temporizador);
  }, [estado, segundos]);

  const platosPorId = useMemo(() => {
    const mapa = new Map<string, Plato>();
    menu.forEach((categoria) =>
      categoria.platos.forEach((plato) => mapa.set(plato.id, plato)),
    );
    return mapa;
  }, [menu]);

  const lineas = useMemo(() => Object.values(carrito), [carrito]);

  const total = useMemo(
    () =>
      lineas.reduce(
        (acc, linea) => acc + precioLinea(platosPorId.get(linea.platoId), linea),
        0,
      ),
    [lineas, platosPorId],
  );

  const cantidadTotal = useMemo(
    () => lineas.reduce((acc, linea) => acc + linea.cantidad, 0),
    [lineas],
  );

  const puedeEditar = Boolean(
    pedidoGuardado &&
      !editando &&
      estado === "nuevo" &&
      segundos > 0,
  );

  const lugaresFiltrados = useMemo(() => {
    const consulta = normalizar(datos.direccion.trim());
    if (!consulta) return lugares;
    return lugares.filter(
      (lugar) =>
        normalizar(lugar.nombre).includes(consulta) ||
        normalizar(lugar.direccion).includes(consulta),
    );
  }, [lugares, datos.direccion]);

  function setOpcion(platoId: string, subcategoriaId: string, opcionId: string) {
    setSelecciones((prev) => ({
      ...prev,
      [platoId]: { ...prev[platoId], [subcategoriaId]: opcionId },
    }));
  }

  function toggleAdicion(platoId: string, adicionId: string) {
    setAdicionesSel((prev) => {
      const actuales = prev[platoId] ?? [];
      const siguientes = actuales.includes(adicionId)
        ? actuales.filter((id) => id !== adicionId)
        : [...actuales, adicionId];
      return { ...prev, [platoId]: siguientes };
    });
  }

  function adicionesDe(plato: Plato): Adicion[] {
    const ids = adicionesSel[plato.id] ?? [];
    return plato.adiciones.filter((adicion) => ids.includes(adicion.id));
  }

  function seleccionDe(plato: Plato): Record<string, string> {
    const actual = selecciones[plato.id] ?? {};
    const resultado: Record<string, string> = {};
    for (const sub of plato.subcategorias) {
      resultado[sub.id] = actual[sub.id] ?? sub.opciones[0]?.id ?? "";
    }
    return resultado;
  }

  function opcionesDe(plato: Plato): Seleccion[] {
    const sel = seleccionDe(plato);
    return plato.subcategorias
      .map((sub) => {
        const opcionId = sel[sub.id];
        const opcion = sub.opciones.find((o) => o.id === opcionId);
        if (!opcion) return null;
        return {
          subcategoria_id: sub.id,
          subcategoria: sub.nombre,
          opcion_id: opcion.id,
          opcion: opcion.nombre,
        };
      })
      .filter((o): o is Seleccion => o !== null);
  }

  function agregarLinea(
    platoId: string,
    opciones: Seleccion[],
    adiciones: Adicion[],
  ) {
    const key = claveLinea(platoId, opciones, adiciones);
    setCarrito((prev) => {
      const actual = prev[key];
      if (actual) {
        return { ...prev, [key]: { ...actual, cantidad: actual.cantidad + 1 } };
      }
      return {
        ...prev,
        [key]: { key, platoId, cantidad: 1, opciones, adiciones },
      };
    });
  }

  function quitar(key: string) {
    setCarrito((prev) => {
      const actual = prev[key];
      if (!actual) return prev;
      const siguiente = { ...prev };
      if (actual.cantidad <= 1) {
        delete siguiente[key];
      } else {
        siguiente[key] = { ...actual, cantidad: actual.cantidad - 1 };
      }
      return siguiente;
    });
  }

  function elegirLugar(lugar: Lugar) {
    setDatos((d) => ({
      ...d,
      direccion: lugar.direccion,
      lugar: lugar.nombre,
    }));
    setLugaresAbierto(false);
  }

  function guardarDatosLocal() {
    try {
      window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos));
      setTieneDatosGuardados(true);
    } catch {
      // Sin almacenamiento disponible: no es crítico.
    }
  }

  function borrarDatosLocal() {
    try {
      window.localStorage.removeItem(CLAVE_DATOS);
    } catch {
      // Sin almacenamiento disponible: no es crítico.
    }
    setTieneDatosGuardados(false);
  }

  function persistirPedido(pedido: PedidoGuardado) {
    try {
      window.localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(pedido));
    } catch {
      // Sin almacenamiento disponible: no es crítico.
    }
    setPedidoGuardado(pedido);
  }

  function empezarEdicion() {
    if (!pedidoGuardado || !puedeEditar) return;

    const siguiente: Record<string, Linea> = {};
    const seleccionesRestauradas: Record<string, Record<string, string>> = {};
    const adicionesRestauradas: Record<string, string[]> = {};

    for (const linea of pedidoGuardado.lineas) {
      if (!platosPorId.has(linea.platoId)) continue;

      const opciones = linea.opciones ?? [];
      const adiciones = linea.adiciones ?? [];
      const key = claveLinea(linea.platoId, opciones, adiciones);

      siguiente[key] = { ...linea, key, opciones, adiciones };

      for (const opcion of opciones) {
        seleccionesRestauradas[linea.platoId] = {
          ...seleccionesRestauradas[linea.platoId],
          [opcion.subcategoria_id]: opcion.opcion_id,
        };
      }

      const previas = adicionesRestauradas[linea.platoId] ?? [];
      adicionesRestauradas[linea.platoId] = [
        ...new Set([...previas, ...adiciones.map((a) => a.id)]),
      ];
    }

    setCarrito(siguiente);
    setSelecciones((prev) => ({ ...prev, ...seleccionesRestauradas }));
    setAdicionesSel((prev) => ({ ...prev, ...adicionesRestauradas }));
    setDatos({
      nombre: pedidoGuardado.datos.nombre,
      telefono: pedidoGuardado.datos.telefono,
      direccion: pedidoGuardado.datos.direccion,
      lugar: pedidoGuardado.datos.lugar ?? "",
    });
    setNotas(pedidoGuardado.datos.notas ?? "");
    setLugaresAbierto(false);
    setEditando(true);
    setResultado(null);
    setVerSeguimiento(false);
    setError(null);
    setCarritoAbierto(true);
  }

  function cancelarEdicion() {
    setEditando(false);
    setCarrito({});
    setCarritoAbierto(false);
    setError(null);
  }

  function descartarPedido() {
    if (
      !confirm(
        "¿Quitar este pedido de este dispositivo? Dejarás de ver su seguimiento y no podrás editarlo desde aquí.",
      )
    ) {
      return;
    }

    try {
      window.localStorage.removeItem(CLAVE_PEDIDO);
    } catch {
      // Sin almacenamiento disponible: no es crítico.
    }
    setPedidoGuardado(null);
    setSeguimiento(null);
    setSegundos(0);
    setVerSeguimiento(false);
    setAviso(null);
    setEditando(false);
    setCarrito({});
    setCarritoAbierto(false);
    setError(null);
    setResultado(null);
  }

  function enviar() {
    setError(null);
    if (lineas.length === 0) return;

    startTransition(async () => {
      const items = lineas.map((linea) => ({
        plato_id: linea.platoId,
        cantidad: linea.cantidad,
        opciones: linea.opciones.map((o) => ({
          subcategoria_id: o.subcategoria_id,
          opcion_id: o.opcion_id,
        })),
        adiciones: linea.adiciones.map((a) => ({ adicion_id: a.id })),
      }));

      if (editando && pedidoGuardado) {
        const res = await actualizarPedido({
          token: pedidoGuardado.token,
          nombre: datos.nombre,
          telefono: datos.telefono,
          direccion: datos.direccion,
          lugar: datos.lugar,
          notas,
          items,
        });

        if (!res.ok) {
          setError(res.error);
          return;
        }

        if (guardarDatos) guardarDatosLocal();

        persistirPedido({
          token: pedidoGuardado.token,
          datos: { ...datos, notas },
          lineas,
        });
        setResultado({ total: res.total, editado: true });
        setEditando(false);
        setCarrito({});
        setAdicionesSel({});
        setCarritoAbierto(false);
        setRefresco((valor) => valor + 1);
        return;
      }

      const res = await crearPedido({
        modo,
        nombre: datos.nombre,
        telefono: datos.telefono,
        direccion: datos.direccion,
        lugar: datos.lugar,
        mesa: Number(mesa) || null,
        notas,
        items,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      if (esDomicilio) {
        if (guardarDatos) guardarDatosLocal();
        persistirPedido({
          token: res.token,
          datos: { ...datos, notas },
          lineas,
        });
        setAviso(null);
      }

      setResultado({ total: res.total, editado: false });
      setCarrito({});
      setAdicionesSel({});
      setCarritoAbierto(false);
    });
  }

  const indiceEstado = estado ? PASOS_DOMICILIO.indexOf(estado) : -1;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="Volver">
          ←
        </Link>
        <div className={styles.headerBrand}>
          <span className={styles.brand}>Sazón con Amor</span>
          <span className={styles.modoTag}>
            {esDomicilio ? "🛵 A domicilio" : "🍽️ En el restaurante"}
          </span>
        </div>
        <button
          type="button"
          className={styles.cartButton}
          onClick={() => setCarritoAbierto(true)}
        >
          🛒
          {cantidadTotal > 0 ? (
            <span className={styles.cartCount}>{cantidadTotal}</span>
          ) : null}
        </button>
      </header>

      {esDomicilio && pedidoGuardado && !resultado ? (
        <div className={styles.pedidoEnCurso}>
          <div className={styles.pedidoEnCursoTexto}>
            <strong>
              {estado ? ESTADO_LABEL[estado] : "Pedido en curso"}
            </strong>
            <span>{textoEstado(estado, segundos)}</span>
            {estado === "nuevo" && segundos > 0 ? (
              <span className={styles.cuenta}>
                Editable por {formatearCuenta(segundos)}
              </span>
            ) : null}
            {aviso ? <span className={styles.aviso}>{aviso}</span> : null}
          </div>
          <div className={styles.pedidoEnCursoAcciones}>
            <button type="button" onClick={() => setVerSeguimiento(true)}>
              Ver seguimiento
            </button>
            {editando ? (
              <button type="button" onClick={cancelarEdicion}>
                Cancelar edición
              </button>
            ) : puedeEditar ? (
              <button type="button" onClick={empezarEdicion}>
                Editar
              </button>
            ) : null}
            <button
              type="button"
              className={styles.descartar}
              onClick={descartarPedido}
            >
              Descartar
            </button>
          </div>
        </div>
      ) : null}

      <main className={styles.menu}>
        {menu.length === 0 ? (
          <p className={styles.empty}>
            El menú aún no está disponible. Vuelve pronto 💛
          </p>
        ) : (
          menu.map((categoria) => (
            <section key={categoria.id} className={styles.section}>
              <h2 className={styles.sectionTitle}>{categoria.nombre}</h2>
              <div className={styles.grid}>
                {categoria.platos.map((plato) => {
                  const tieneOpciones = plato.subcategorias.length > 0;
                  const seleccion = tieneOpciones ? seleccionDe(plato) : {};
                  const opcionesActuales = tieneOpciones
                    ? opcionesDe(plato)
                    : [];
                  const adicionesActuales = adicionesDe(plato);
                  const clave = claveLinea(
                    plato.id,
                    opcionesActuales,
                    adicionesActuales,
                  );
                  const cantidad = carrito[clave]?.cantidad ?? 0;
                  const precioActual =
                    plato.precio + sumarAdiciones(adicionesActuales);

                  return (
                    <article
                      key={plato.id}
                      className={`${styles.card} ${
                        plato.disponible ? "" : styles.cardDisabled
                      }`}
                    >
                      <div className={styles.imageWrap}>
                        {plato.imagen_url ? (
                          <Image
                            src={plato.imagen_url}
                            alt={plato.nombre}
                            fill
                            sizes="(max-width: 640px) 100vw, 320px"
                            className={styles.image}
                          />
                        ) : (
                          <span className={styles.imagePlaceholder} aria-hidden>
                            🍲
                          </span>
                        )}
                        {!plato.disponible ? (
                          <span className={styles.badgeAgotado}>Agotado</span>
                        ) : null}
                      </div>

                      <div className={styles.cardBody}>
                        <h3>{plato.nombre}</h3>
                        {plato.descripcion ? (
                          <p className={styles.desc}>{plato.descripcion}</p>
                        ) : null}

                        {plato.disponible && tieneOpciones
                          ? plato.subcategorias.map((sub) => (
                              <div key={sub.id} className={styles.cardGrupo}>
                                <span className={styles.cardGrupoTitulo}>
                                  {sub.nombre}
                                </span>
                                <div className={styles.cardOpciones}>
                                  {sub.opciones.map((opcion) => {
                                    const marcado =
                                      seleccion[sub.id] === opcion.id;
                                    return (
                                      <label
                                        key={opcion.id}
                                        className={`${styles.cardOpcion} ${
                                          marcado
                                            ? styles.cardOpcionActiva
                                            : ""
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`${plato.id}-${sub.id}`}
                                          checked={marcado}
                                          onChange={() =>
                                            setOpcion(
                                              plato.id,
                                              sub.id,
                                              opcion.id,
                                            )
                                          }
                                        />
                                        <span>{opcion.nombre}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))
                          : null}

                        {plato.disponible && plato.adiciones.length > 0 ? (
                          <div className={styles.cardGrupo}>
                            <span className={styles.cardGrupoTitulo}>
                              Adiciones
                            </span>
                            <div className={styles.cardAdiciones}>
                              {plato.adiciones.map((adicion) => {
                                const activa = adicionesActuales.some(
                                  (a) => a.id === adicion.id,
                                );
                                return (
                                  <label
                                    key={adicion.id}
                                    className={`${styles.cardAdicion} ${
                                      activa ? styles.cardOpcionActiva : ""
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={activa}
                                      onChange={() =>
                                        toggleAdicion(plato.id, adicion.id)
                                      }
                                    />
                                    <span>{adicion.nombre}</span>
                                    <span className={styles.adicionPrecio}>
                                      +{formatearPrecio(adicion.precio)}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className={styles.cardFooter}>
                          <span className={styles.precio}>
                            {formatearPrecio(precioActual)}
                          </span>

                          {plato.disponible ? (
                            cantidad > 0 ? (
                              <div className={styles.stepper}>
                                <button
                                  type="button"
                                  onClick={() => quitar(clave)}
                                  aria-label="Quitar uno"
                                >
                                  −
                                </button>
                                <span>{cantidad}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    agregarLinea(
                                      plato.id,
                                      opcionesActuales,
                                      adicionesActuales,
                                    )
                                  }
                                  aria-label="Agregar uno"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles.add}
                                onClick={() =>
                                  agregarLinea(
                                    plato.id,
                                    opcionesActuales,
                                    adicionesActuales,
                                  )
                                }
                              >
                                Agregar
                              </button>
                            )
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {cantidadTotal > 0 ? (
        <button
          type="button"
          className={styles.cartBar}
          onClick={() => setCarritoAbierto(true)}
        >
          <span>Ver pedido ({cantidadTotal})</span>
          <span>{formatearPrecio(total)}</span>
        </button>
      ) : null}

      {carritoAbierto ? (
        <div className={styles.overlay} onClick={() => setCarritoAbierto(false)}>
          <aside
            className={styles.drawer}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHead}>
              <h2>{editando ? "Editar pedido" : "Tu pedido"}</h2>
              <button
                type="button"
                onClick={() => setCarritoAbierto(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerBody}>
              {lineas.length === 0 ? (
                <p className={styles.emptyCart}>Tu carrito está vacío.</p>
              ) : (
                <ul className={styles.itemList}>
                  {lineas.map((linea) => {
                    const plato = platosPorId.get(linea.platoId);
                    if (!plato) return null;
                    const extras = sumarAdiciones(linea.adiciones);
                    return (
                      <li key={linea.key} className={styles.item}>
                        <div>
                          <span className={styles.itemName}>
                            {plato.nombre}
                          </span>
                          {linea.opciones.length > 0 ? (
                            <span className={styles.itemOpciones}>
                              {linea.opciones
                                .map((o) => `${o.subcategoria}: ${o.opcion}`)
                                .join(" · ")}
                            </span>
                          ) : null}
                          {linea.adiciones.length > 0 ? (
                            <span className={styles.itemAdiciones}>
                              Adiciones:{" "}
                              {linea.adiciones
                                .map((a) => a.nombre)
                                .join(", ")}
                            </span>
                          ) : null}
                          <span className={styles.itemPrice}>
                            {formatearPrecio(plato.precio + extras)}
                          </span>
                        </div>
                        <div className={styles.stepper}>
                          <button
                            type="button"
                            onClick={() => quitar(linea.key)}
                            aria-label="Quitar uno"
                          >
                            −
                          </button>
                          <span>{linea.cantidad}</span>
                          <button
                            type="button"
                            onClick={() =>
                              agregarLinea(
                                plato.id,
                                linea.opciones,
                                linea.adiciones,
                              )
                            }
                            aria-label="Agregar uno"
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  enviar();
                }}
              >
                <label className={styles.field}>
                  <span>Tu nombre *</span>
                  <input
                    name="nombre"
                    required
                    placeholder="Nombre"
                    value={datos.nombre}
                    onChange={(event) =>
                      setDatos((d) => ({ ...d, nombre: event.target.value }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Teléfono</span>
                  <input
                    name="telefono"
                    inputMode="tel"
                    placeholder="300 000 0000"
                    value={datos.telefono}
                    onChange={(event) =>
                      setDatos((d) => ({ ...d, telefono: event.target.value }))
                    }
                  />
                </label>

                {esDomicilio ? (
                  <div className={styles.field}>
                    <span>Dirección *</span>
                    <div className={styles.autocomplete}>
                      <input
                        name="direccion"
                        required
                        autoComplete="off"
                        aria-label="Dirección"
                        placeholder="Escribe tu dirección o busca un lugar (ej. Casa)"
                        value={datos.direccion}
                        onFocus={() => setLugaresAbierto(true)}
                        onBlur={() => setLugaresAbierto(false)}
                        onChange={(event) => {
                          setDatos((d) => ({
                            ...d,
                            direccion: event.target.value,
                            lugar: "",
                          }));
                          setLugaresAbierto(true);
                        }}
                      />
                      {lugaresAbierto && lugaresFiltrados.length > 0 ? (
                        <ul className={styles.sugerencias}>
                          {lugaresFiltrados.map((lugar) => (
                            <li key={lugar.id}>
                              <button
                                type="button"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  elegirLugar(lugar);
                                }}
                              >
                                <span className={styles.sugerenciaNombre}>
                                  {lugar.nombre}
                                </span>
                                <span className={styles.sugerenciaDireccion}>
                                  {lugar.direccion}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {datos.lugar ? (
                      <span className={styles.lugarElegido}>
                        Lugar: <strong>{datos.lugar}</strong>
                        <button
                          type="button"
                          onClick={() => setDatos((d) => ({ ...d, lugar: "" }))}
                        >
                          Quitar
                        </button>
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <label className={styles.field}>
                    <span>Mesa *</span>
                    <input
                      name="mesa"
                      type="number"
                      min={1}
                      max={60}
                      required
                      placeholder="Número de mesa"
                      value={mesa}
                      onChange={(event) => setMesa(event.target.value)}
                    />
                  </label>
                )}

                <label className={styles.field}>
                  <span>Notas (opcional)</span>
                  <textarea
                    name="notas"
                    rows={2}
                    placeholder="Sin cebolla, término medio, etc."
                    value={notas}
                    onChange={(event) => setNotas(event.target.value)}
                  />
                </label>

                {esDomicilio ? (
                  <div className={styles.guardarDatos}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={guardarDatos}
                        onChange={(event) =>
                          setGuardarDatos(event.target.checked)
                        }
                      />
                      <span>Guardar mis datos para la próxima vez</span>
                    </label>
                    {tieneDatosGuardados ? (
                      <button
                        type="button"
                        className={styles.limpiarDatos}
                        onClick={borrarDatosLocal}
                      >
                        Borrar datos guardados
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {error ? <p className={styles.error}>{error}</p> : null}

                <div className={styles.totalRow}>
                  <span>Total</span>
                  <strong>{formatearPrecio(total)}</strong>
                </div>

                <button
                  type="submit"
                  className={styles.submit}
                  disabled={pending || lineas.length === 0}
                >
                  {pending
                    ? "Guardando…"
                    : editando
                      ? "Guardar cambios"
                      : esDomicilio
                        ? "Enviar pedido a domicilio"
                        : "Enviar pedido"}
                </button>
                <p className={styles.note}>
                  {esDomicilio
                    ? "Pagas en efectivo o con tarjeta al recibir."
                    : "Pagas en caja al terminar."}
                </p>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      {verSeguimiento && pedidoGuardado ? (
        <div
          className={styles.overlay}
          onClick={() => setVerSeguimiento(false)}
        >
          <div
            className={styles.seguimiento}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHead}>
              <h2>Tu pedido</h2>
              <button
                type="button"
                onClick={() => setVerSeguimiento(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className={styles.seguimientoBody}>
              {estado === "cancelado" ? (
                <p className={styles.cancelado}>
                  El pedido fue cancelado. Si tienes dudas, contáctanos.
                </p>
              ) : (
                <ol className={styles.pasos}>
                  {PASOS_DOMICILIO.map((paso, indice) => {
                    const hecho = indiceEstado > indice;
                    const actual = indiceEstado === indice;
                    return (
                      <li
                        key={paso}
                        className={`${styles.paso} ${
                          hecho ? styles.pasoHecho : ""
                        } ${actual ? styles.pasoActual : ""}`}
                      >
                        <span className={styles.pasoPunto}>
                          {hecho ? "✓" : indice + 1}
                        </span>
                        <span>{ESTADO_LABEL[paso]}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {estado === "nuevo" ? (
                segundos > 0 ? (
                  <div className={styles.cuentaBox}>
                    <span>Tiempo para modificar</span>
                    <strong>{formatearCuenta(segundos)}</strong>
                    {puedeEditar ? (
                      <button
                        type="button"
                        className={styles.submit}
                        onClick={empezarEdicion}
                      >
                        Editar pedido
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className={styles.cuentaFin}>
                    El tiempo para modificar el pedido terminó.
                  </p>
                )
              ) : (
                <p className={styles.seguimientoTexto}>
                  {textoEstado(estado, segundos)}
                </p>
              )}

              {aviso ? <p className={styles.aviso}>{aviso}</p> : null}

              <div className={styles.totalRow}>
                <span>Total</span>
                <strong>
                  {formatearPrecio(seguimiento?.total ?? total)}
                </strong>
              </div>

              <p className={styles.note}>
                Actualizamos el estado automáticamente.
              </p>

              <button
                type="button"
                className={styles.cerrarSeguimiento}
                onClick={() => setVerSeguimiento(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resultado ? (
        <div className={styles.overlay}>
          <div className={styles.success}>
            <span className={styles.successIcon}>🎉</span>
            <h2>
              {resultado.editado ? "¡Pedido actualizado!" : "¡Pedido recibido!"}
            </h2>
            <p className={styles.successTotal}>
              Total: <strong>{formatearPrecio(resultado.total)}</strong>
            </p>
            <p className={styles.note}>
              {resultado.editado
                ? "Guardamos los cambios de tu pedido."
                : esDomicilio
                  ? "Estamos preparando tu pedido. Te lo llevamos pronto."
                  : "Estamos preparando tu pedido, lo llevamos a tu mesa."}
            </p>
            {esDomicilio ? (
              <button
                type="button"
                className={styles.successButton}
                onClick={() => {
                  setResultado(null);
                  setVerSeguimiento(true);
                }}
              >
                Ver mi pedido
              </button>
            ) : null}
            <Link
              href="/"
              className={
                esDomicilio ? styles.successLink : styles.successButton
              }
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
