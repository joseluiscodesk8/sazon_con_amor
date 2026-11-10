"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  crearMesero,
  eliminarMesero,
  type MeseroState,
} from "./actions";
import type { AdminMesero } from "./types";
import styles from "./meseros.module.scss";

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export default function MeserosAdmin({ meseros }: { meseros: AdminMesero[] }) {
  const [state, formAction, pending] = useActionState<MeseroState, FormData>(
    crearMesero,
    {},
  );
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [eliminando, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  function onEliminar(mesero: AdminMesero) {
    const nombre = mesero.nombre || mesero.usuario || "este mesero";
    if (
      !confirm(
        `¿Eliminar la cuenta de ${nombre}? El historial de pedidos se conserva.`,
      )
    ) {
      return;
    }

    setErrorEliminar(null);
    startTransition(async () => {
      const res = await eliminarMesero(mesero.user_id);
      if (!res.ok) setErrorEliminar(res.error);
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Meseros</h1>
          <p className={styles.subtitle}>
            Cuentas para tomar pedidos desde /mesero.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="nuevo-mesero">
          <h2 id="nuevo-mesero">Nueva cuenta</h2>
          <p className={styles.ayuda}>
            Comparte el usuario y la contraseña con el mesero. El nombre visible
            será el mismo usuario. Podrá crear pedidos, pero no entrar al panel
            de administración.
          </p>

          <form ref={formRef} action={formAction} className={styles.form}>
            <label>
              <span>Usuario</span>
              <input
                name="usuario"
                type="text"
                required
                minLength={3}
                maxLength={30}
                autoComplete="off"
                placeholder="juan"
              />
            </label>

            <label>
              <span>Contraseña temporal</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
            </label>

            {state.error ? (
              <p className={styles.error} role="alert">
                {state.error}
              </p>
            ) : null}
            {state.ok ? (
              <p className={styles.exito} role="status">
                {state.mensaje}
              </p>
            ) : null}

            <button type="submit" className={styles.submit} disabled={pending}>
              {pending ? "Creando…" : "Crear mesero"}
            </button>
          </form>
        </section>

        <section className={styles.card} aria-labelledby="lista-meseros">
          <div className={styles.listaHead}>
            <div>
              <h2 id="lista-meseros">Cuentas activas</h2>
              <p className={styles.ayuda}>
                {meseros.length} {meseros.length === 1 ? "mesero" : "meseros"}
              </p>
            </div>
          </div>

          {errorEliminar ? (
            <p className={styles.error} role="alert">
              {errorEliminar}
            </p>
          ) : null}

          {meseros.length === 0 ? (
            <p className={styles.vacio}>Todavía no hay meseros.</p>
          ) : (
            <ul className={styles.lista}>
              {meseros.map((mesero) => (
                <li key={mesero.user_id} className={styles.mesero}>
                  <div className={styles.avatar} aria-hidden>
                    {(mesero.nombre || mesero.usuario || "M")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className={styles.datos}>
                    <strong>{mesero.nombre || mesero.usuario}</strong>
                    {mesero.nombre && mesero.nombre !== mesero.usuario ? (
                      <span>@{mesero.usuario}</span>
                    ) : null}
                    <small>Creado el {formatearFecha(mesero.created_at)}</small>
                  </div>
                  <button
                    type="button"
                    className={styles.eliminar}
                    onClick={() => onEliminar(mesero)}
                    disabled={eliminando}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
