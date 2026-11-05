"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registrarAdmin, type RegistroState } from "./actions";
import styles from "../login/login.module.scss";

export default function RegistroPage() {
  const [state, formAction, pending] = useActionState<RegistroState, FormData>(
    registrarAdmin,
    {},
  );

  return (
    <main id="contenido" tabIndex={-1} className={styles.wrap}>
      <form action={formAction} className={styles.card}>
        <div className={styles.brand}>
          <h1>Crear administrador</h1>
          <p>Sazón con Amor</p>
        </div>

        <label className={styles.field}>
          <span>Código de instalación</span>
          <input
            name="codigo"
            type="password"
            placeholder="Código secreto"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Usuario</span>
          <input
            name="usuario"
            type="text"
            autoComplete="username"
            placeholder="por ejemplo: cocina"
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9._\-]+"
            title="3 a 30 caracteres: letras, números, punto, guion o guion bajo."
            required
          />
        </label>

        <label className={styles.field}>
          <span>Contraseña (mín. 8 caracteres)</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
        </label>

        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? "Creando…" : "Crear administrador"}
        </button>

        <Link href="/admin/login" className={styles.volver}>
          ← Ya tengo cuenta
        </Link>
      </form>
    </main>
  );
}
