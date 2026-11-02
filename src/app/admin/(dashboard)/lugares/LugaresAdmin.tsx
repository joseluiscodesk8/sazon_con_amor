"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cambiarActivoLugar,
  eliminarLugar,
  guardarLugar,
} from "./actions";
import type { AdminLugar } from "./types";
import styles from "./lugares.module.scss";

type Props = {
  lugares: AdminLugar[];
};

export default function LugaresAdmin({ lugares }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<AdminLugar | "nuevo" | null>(null);

  function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await accion();
      if (!res.ok) {
        setError(res.error ?? "Ocurrió un error.");
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function onGuardar(formData: FormData) {
    const editando = modal !== "nuevo" ? modal : null;
    ejecutar(() =>
      guardarLugar({
        id: editando?.id,
        nombre: String(formData.get("nombre") ?? ""),
        direccion: String(formData.get("direccion") ?? ""),
        activo: formData.get("activo") === "on",
      }),
    );
  }

  function onEliminar(lugar: AdminLugar) {
    if (!window.confirm(`¿Eliminar "${lugar.nombre}"?`)) return;
    ejecutar(() => eliminarLugar(lugar.id));
  }

  function onToggle(lugar: AdminLugar) {
    ejecutar(() => cambiarActivoLugar(lugar.id, !lugar.activo));
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Lugares frecuentes</h1>
          <p className={styles.subtitle}>
            Aparecen al buscar en el campo de dirección del checkout a
            domicilio. Al elegirlos se llena la dirección.
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setModal("nuevo")}
        >
          + Lugar
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {lugares.length === 0 ? (
        <p className={styles.empty}>
          Aún no hay lugares. Crea el primero para agilizar los domicilios.
        </p>
      ) : (
        <ul className={styles.lista}>
          {lugares.map((lugar) => (
            <li key={lugar.id} className={styles.lugar}>
              <div className={styles.lugarInfo}>
                <span className={styles.lugarNombre}>{lugar.nombre}</span>
                <span className={styles.lugarDireccion}>
                  {lugar.direccion}
                </span>
                {!lugar.activo ? (
                  <span className={styles.inactivo}>Oculto</span>
                ) : null}
              </div>
              <div className={styles.buttons}>
                <button type="button" onClick={() => onToggle(lugar)}>
                  {lugar.activo ? "Ocultar" : "Mostrar"}
                </button>
                <button type="button" onClick={() => setModal(lugar)}>
                  Editar
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => onEliminar(lugar)}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal ? (
        <div className={styles.overlay} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>{modal === "nuevo" ? "Nuevo lugar" : "Editar lugar"}</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <form action={onGuardar} className={styles.form}>
              <label className={styles.field}>
                <span>Nombre *</span>
                <input
                  name="nombre"
                  required
                  placeholder="Ej. Casa, Oficina, Mamá"
                  defaultValue={modal === "nuevo" ? "" : modal.nombre}
                />
              </label>
              <label className={styles.field}>
                <span>Dirección *</span>
                <textarea
                  name="direccion"
                  rows={2}
                  required
                  placeholder="Calle, número, barrio, referencias"
                  defaultValue={modal === "nuevo" ? "" : modal.direccion}
                />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={modal === "nuevo" ? true : modal.activo}
                />
                <span>Visible en el checkout</span>
              </label>
              <button
                type="submit"
                className={styles.primary}
                disabled={pending}
              >
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
