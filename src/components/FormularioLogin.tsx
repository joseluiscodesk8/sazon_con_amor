"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, type LoginState } from "@/lib/auth-actions";
import styles from "@/app/admin/login/login.module.scss";

type Props = {
  tipo?: "admin" | "mesero";
};

export default function FormularioLogin({ tipo = "admin" }: Props) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    signIn,
    {},
  );
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const sinAcceso = errorParam === "sin-acceso";
  const next = searchParams.get("next") ?? "";
  const esMesero = tipo === "mesero";
  const sesionMesero = errorParam === "rol-mesero";
  const sesionAdmin = errorParam === "rol-admin";

  return (
    <main id="contenido" tabIndex={-1} className={styles.wrap}>
      <form action={formAction} className={styles.card}>
        <div className={styles.brand}>
          <h1>Sazón con Amor</h1>
          <p>{esMesero ? "Acceso para meseros" : "Panel de administración"}</p>
        </div>

        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="tipo" value={tipo} />

        <label className={styles.field}>
          <span>Usuario</span>
          <input
            name="usuario"
            type="text"
            autoComplete="username"
            placeholder="tu usuario"
            maxLength={30}
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
            Esa cuenta no tiene acceso.
          </p>
        ) : null}
        {sesionMesero ? (
          <p className={styles.error} role="alert">
            La sesión actual es de mesero. Inicia sesión con una cuenta de
            administrador.
          </p>
        ) : null}
        {sesionAdmin ? (
          <p className={styles.error} role="alert">
            La sesión actual es de administrador. Inicia sesión con una cuenta
            de mesero.
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

        {esMesero ? null : (
          <Link href="/admin/registro" className={styles.volver}>
            Crear administrador →
          </Link>
        )}
      </form>
    </main>
  );
}
