"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, type LoginState } from "./actions";
import styles from "./login.module.scss";

export default function FormularioLogin() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    signIn,
    {},
  );
  const searchParams = useSearchParams();
  const sinAcceso = searchParams.get("error") === "sin-acceso";

  return (
    <main id="contenido" tabIndex={-1} className={styles.wrap}>
      <form action={formAction} className={styles.card}>
        <div className={styles.brand}>
          <h1>Sazón con Amor</h1>
          <p>Panel de administración</p>
        </div>

        <label className={styles.field}>
          <span>Usuario</span>
          <input
            name="usuario"
            type="text"
            autoComplete="username"
            placeholder="tu usuario"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </label>

        {sinAcceso ? (
          <p className={styles.error} role="alert">
            Esa cuenta no tiene acceso de administrador.
          </p>
        ) : null}
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>

        <Link href="/admin/registro" className={styles.volver}>
          Crear administrador →
        </Link>
      </form>
    </main>
  );
}
