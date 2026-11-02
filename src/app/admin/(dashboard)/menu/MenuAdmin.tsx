"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatearPrecio } from "@/lib/format";
import { comprimirImagen } from "@/lib/imagen";
import {
  cambiarDisponibleAdicion,
  cambiarDisponiblePlato,
  eliminarAdicion,
  eliminarCategoria,
  eliminarPlato,
  guardarAdicion,
  guardarCategoria,
  guardarPlato,
  subirImagenPlato,
} from "./actions";
import type { AdminAdicion, AdminCategoria, AdminPlato } from "./types";
import styles from "./menu.module.scss";

type Props = {
  categorias: AdminCategoria[];
  platos: AdminPlato[];
  adiciones: AdminAdicion[];
};

type CatTipo = "normal" | "sub";

export default function MenuAdmin({
  categorias,
  platos,
  adiciones,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [catModal, setCatModal] = useState<AdminCategoria | "nueva" | null>(null);
  const [catTipo, setCatTipo] = useState<CatTipo>("normal");
  const [platoModal, setPlatoModal] = useState<AdminPlato | "nuevo" | null>(null);
  const [platoCategoria, setPlatoCategoria] = useState<string>("");
  const [adicionModal, setAdicionModal] = useState<
    AdminAdicion | "nueva" | null
  >(null);

  const normales = useMemo(
    () => categorias.filter((c) => !c.es_subcategoria),
    [categorias],
  );
  const subcategorias = useMemo(
    () => categorias.filter((c) => c.es_subcategoria),
    [categorias],
  );

  const categoriaEnModal = categorias.find((c) => c.id === platoCategoria);
  const esSubEnModal = categoriaEnModal?.es_subcategoria ?? false;

  function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await accion();
      if (!res.ok) {
        setError(res.error ?? "Ocurrió un error.");
        return;
      }
      setCatModal(null);
      setPlatoModal(null);
      setAdicionModal(null);
      router.refresh();
    });
  }

  function abrirNuevaCategoria(tipo: CatTipo) {
    setCatTipo(tipo);
    setCatModal("nueva");
  }

  function abrirEditarCategoria(categoria: AdminCategoria) {
    setCatTipo(categoria.es_subcategoria ? "sub" : "normal");
    setCatModal(categoria);
  }

  function onGuardarCategoria(formData: FormData) {
    const editando = catModal !== "nueva" ? catModal : null;
    ejecutar(() =>
      guardarCategoria({
        id: editando?.id,
        nombre: String(formData.get("nombre") ?? ""),
        orden: Number(formData.get("orden") ?? 0),
        activa: formData.get("activa") === "on",
        es_subcategoria:
          editando?.es_subcategoria ?? catTipo === "sub",
      }),
    );
  }

  function abrirNuevoPlato() {
    if (normales.length === 0) {
      setError("Primero crea una categoría.");
      return;
    }
    setPlatoCategoria(normales[0].id);
    setPlatoModal("nuevo");
  }

  function abrirNuevaOpcion(categoria: AdminCategoria) {
    setPlatoCategoria(categoria.id);
    setPlatoModal("nuevo");
  }

  function abrirEditarPlato(plato: AdminPlato) {
    setPlatoCategoria(plato.categoria_id);
    setPlatoModal(plato);
  }

  function onGuardarPlato(formData: FormData) {
    const editando = platoModal !== "nuevo" ? platoModal : null;
    const archivo = formData.get("imagen");
    const imagenUrl = String(formData.get("imagen_url") ?? "");
    const categoriaId = String(formData.get("categoria_id") ?? "");

    ejecutar(async () => {
      let url = imagenUrl || null;

      if (archivo instanceof File && archivo.size > 0) {
        const optimizada = await comprimirImagen(archivo);
        const fd = new FormData();
        fd.append("file", optimizada);
        const subida = await subirImagenPlato(fd);
        if (!subida.ok) return { ok: false as const, error: subida.error };
        url = subida.data.url;
      }

      return await guardarPlato({
        id: editando?.id,
        categoria_id: categoriaId,
        nombre: String(formData.get("nombre") ?? ""),
        descripcion: String(formData.get("descripcion") ?? ""),
        precio: Number(formData.get("precio") ?? 0),
        disponible: formData.get("disponible") === "on",
        imagen_url: url,
        orden: Number(formData.get("orden") ?? 0),
      });
    });
  }

  function onGuardarAdicion(formData: FormData) {
    const editando = adicionModal !== "nueva" ? adicionModal : null;
    ejecutar(() =>
      guardarAdicion({
        id: editando?.id,
        nombre: String(formData.get("nombre") ?? ""),
        precio: Number(formData.get("precio") ?? 0),
        disponible: formData.get("disponible") === "on",
      }),
    );
  }

  function onEliminarAdicion(adicion: AdminAdicion) {
    if (
      !confirm(`¿Eliminar la adición "${adicion.nombre}"?`)
    )
      return;
    ejecutar(() => eliminarAdicion(adicion.id));
  }

  function onToggleDisponibleAdicion(adicion: AdminAdicion) {
    ejecutar(() =>
      cambiarDisponibleAdicion(adicion.id, !adicion.disponible),
    );
  }

  function onEliminarCategoria(categoria: AdminCategoria) {
    if (
      !confirm(
        `¿Eliminar "${categoria.nombre}"? También se eliminarán sus platos.`,
      )
    )
      return;
    ejecutar(() => eliminarCategoria(categoria.id));
  }

  function onEliminarPlato(plato: AdminPlato) {
    if (!confirm(`¿Eliminar "${plato.nombre}"?`)) return;
    ejecutar(() => eliminarPlato(plato.id));
  }

  function onToggleDisponible(plato: AdminPlato) {
    ejecutar(() => cambiarDisponiblePlato(plato.id, !plato.disponible));
  }

  function renderCategoria(categoria: AdminCategoria) {
    const items = platos.filter((p) => p.categoria_id === categoria.id);
    const esSub = categoria.es_subcategoria;

    return (
      <section key={categoria.id} className={styles.categoria}>
        <header className={styles.catHead}>
          <div className={styles.catTitle}>
            <h2>{categoria.nombre}</h2>
            {esSub ? (
              <span className={styles.tagSub}>Subcategoría</span>
            ) : null}
            {!categoria.activa ? (
              <span className={styles.inactiva}>Oculta</span>
            ) : null}
          </div>
          <div className={styles.catButtons}>
            {esSub ? (
              <button
                type="button"
                onClick={() => abrirNuevaOpcion(categoria)}
              >
                + Opción
              </button>
            ) : null}
            <button type="button" onClick={() => abrirEditarCategoria(categoria)}>
              Editar
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => onEliminarCategoria(categoria)}
            >
              Eliminar
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <p className={styles.catEmpty}>
            {esSub ? "Sin opciones." : "Sin platos en esta categoría."}
          </p>
        ) : (
          <ul className={styles.lista}>
            {items.map((plato) => (
              <li key={plato.id} className={styles.plato}>
                {!esSub ? (
                  <div className={styles.thumb}>
                    {plato.imagen_url ? (
                      <Image
                        src={plato.imagen_url}
                        alt={plato.nombre}
                        fill
                        sizes="64px"
                      />
                    ) : (
                      <span aria-hidden>🍲</span>
                    )}
                  </div>
                ) : null}
                <div className={styles.platoInfo}>
                  <span className={styles.platoNombre}>{plato.nombre}</span>
                  {!esSub ? (
                    <span className={styles.platoPrecio}>
                      {formatearPrecio(plato.precio)}
                    </span>
                  ) : null}
                  {!plato.disponible ? (
                    <span className={styles.agotado}>Agotado</span>
                  ) : null}
                </div>
                <div className={styles.platoButtons}>
                  <button
                    type="button"
                    onClick={() => onToggleDisponible(plato)}
                  >
                    {plato.disponible ? "Marcar agotado" : "Marcar disponible"}
                  </button>
                  <button type="button" onClick={() => abrirEditarPlato(plato)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => onEliminarPlato(plato)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Menú</h1>
          <p className={styles.subtitle}>
            Lo que edites aquí se ve al instante en el menú público.
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => abrirNuevaCategoria("normal")}
          >
            + Categoría
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => abrirNuevaCategoria("sub")}
          >
            + Subcategoría
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setAdicionModal("nueva")}
          >
            + Adición
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={abrirNuevoPlato}
          >
            + Plato
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {categorias.length === 0 ? (
        <p className={styles.empty}>
          Aún no hay categorías. Crea la primera para empezar.
        </p>
      ) : (
        <>
          {normales.length === 0 ? (
            <p className={styles.catEmpty}>
              No hay categorías de platos todavía.
            </p>
          ) : (
            normales.map(renderCategoria)
          )}

          <h2 className={styles.grupoTitulo}>Subcategorías</h2>
          <p className={styles.grupoTexto}>
            Acompañantes y opciones (jugos, sopas, frijoles). No llevan precio ni
            foto; se ofrecen automáticamente en todos los platos.
          </p>
          {subcategorias.length === 0 ? (
            <p className={styles.catEmpty}>
              Aún no hay subcategorías. Crea una con “+ Subcategoría”.
            </p>
          ) : (
            subcategorias.map(renderCategoria)
          )}

          <h2 className={styles.grupoTitulo}>Adiciones</h2>
          <p className={styles.grupoTexto}>
            Extras con precio que se ofrecen automáticamente en todos los platos.
            Suman al precio del producto.
          </p>
          {adiciones.length === 0 ? (
            <p className={styles.catEmpty}>
              Aún no hay adiciones. Crea una con “+ Adición”.
            </p>
          ) : (
            <section className={styles.categoria}>
              <ul className={styles.lista}>
                {adiciones.map((adicion) => (
                  <li key={adicion.id} className={styles.plato}>
                    <div className={styles.platoInfo}>
                      <span className={styles.platoNombre}>
                        {adicion.nombre}
                      </span>
                      <span className={styles.platoPrecio}>
                        +{formatearPrecio(adicion.precio)}
                      </span>
                      {!adicion.disponible ? (
                        <span className={styles.agotado}>Agotada</span>
                      ) : null}
                    </div>
                    <div className={styles.platoButtons}>
                      <button
                        type="button"
                        onClick={() => onToggleDisponibleAdicion(adicion)}
                      >
                        {adicion.disponible
                          ? "Marcar agotada"
                          : "Marcar disponible"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdicionModal(adicion)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={styles.danger}
                        onClick={() => onEliminarAdicion(adicion)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {catModal ? (
        <Modal
          titulo={
            catModal === "nueva"
              ? catTipo === "sub"
                ? "Nueva subcategoría"
                : "Nueva categoría"
              : "Editar categoría"
          }
          onClose={() => setCatModal(null)}
        >
          <form action={onGuardarCategoria} className={styles.form}>
            <label className={styles.field}>
              <span>Nombre *</span>
              <input
                name="nombre"
                required
                defaultValue={catModal === "nueva" ? "" : catModal.nombre}
              />
            </label>
            {catModal === "nueva" && catTipo === "sub" ? (
              <p className={styles.hint}>
                Aparecerá como grupo de opciones en todos los platos.
              </p>
            ) : null}
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Orden</span>
                <input
                  name="orden"
                  type="number"
                  defaultValue={catModal === "nueva" ? 0 : catModal.orden}
                />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  name="activa"
                  defaultChecked={catModal === "nueva" ? true : catModal.activa}
                />
                <span>Visible en el menú</span>
              </label>
            </div>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </Modal>
      ) : null}

      {platoModal ? (
        <Modal
          titulo={
            platoModal === "nuevo"
              ? esSubEnModal
                ? "Nueva opción"
                : "Nuevo plato"
              : esSubEnModal
                ? "Editar opción"
                : "Editar plato"
          }
          onClose={() => setPlatoModal(null)}
        >
          <form action={onGuardarPlato} className={styles.form}>
            <label className={styles.field}>
              <span>Categoría *</span>
              <select
                name="categoria_id"
                value={platoCategoria}
                onChange={(e) => setPlatoCategoria(e.target.value)}
              >
                {normales.length > 0 ? (
                  <optgroup label="Platos">
                    {normales.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {subcategorias.length > 0 ? (
                  <optgroup label="Subcategorías (opciones)">
                    {subcategorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <label className={styles.field}>
              <span>{esSubEnModal ? "Nombre de la opción *" : "Nombre *"}</span>
              <input
                name="nombre"
                required
                defaultValue={platoModal === "nuevo" ? "" : platoModal.nombre}
              />
            </label>

            {esSubEnModal ? (
              <input type="hidden" name="precio" value="0" />
            ) : (
              <>
                <label className={styles.field}>
                  <span>Descripción</span>
                  <textarea
                    name="descripcion"
                    rows={2}
                    defaultValue={
                      platoModal === "nuevo"
                        ? ""
                        : (platoModal.descripcion ?? "")
                    }
                  />
                </label>
                <div className={styles.row}>
                  <label className={styles.field}>
                    <span>Precio *</span>
                    <input
                      name="precio"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      defaultValue={
                        platoModal === "nuevo" ? 0 : platoModal.precio
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Orden</span>
                    <input
                      name="orden"
                      type="number"
                      defaultValue={platoModal === "nuevo" ? 0 : platoModal.orden}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>Foto (máx. 4 MB)</span>
                  <input name="imagen" type="file" accept="image/*" />
                </label>
              </>
            )}

            {esSubEnModal ? (
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Orden</span>
                  <input
                    name="orden"
                    type="number"
                    defaultValue={platoModal === "nuevo" ? 0 : platoModal.orden}
                  />
                </label>
              </div>
            ) : null}

            <input
              type="hidden"
              name="imagen_url"
              value={platoModal === "nuevo" ? "" : (platoModal.imagen_url ?? "")}
            />

            {esSubEnModal ? (
              <p className={styles.hint}>
                Esta opción se ofrece automáticamente en todos los platos.
              </p>
            ) : null}

            <label className={styles.check}>
              <input
                type="checkbox"
                name="disponible"
                defaultChecked={
                  platoModal === "nuevo" ? true : platoModal.disponible
                }
              />
              <span>Disponible</span>
            </label>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </Modal>
      ) : null}

      {adicionModal ? (
        <Modal
          titulo={adicionModal === "nueva" ? "Nueva adición" : "Editar adición"}
          onClose={() => setAdicionModal(null)}
        >
          <form action={onGuardarAdicion} className={styles.form}>
            <label className={styles.field}>
              <span>Nombre *</span>
              <input
                name="nombre"
                required
                placeholder="Ej. Porción de chicharrón"
                defaultValue={adicionModal === "nueva" ? "" : adicionModal.nombre}
              />
            </label>
            <label className={styles.field}>
              <span>Precio *</span>
              <input
                name="precio"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={adicionModal === "nueva" ? 0 : adicionModal.precio}
              />
            </label>
            <p className={styles.hint}>
              Se ofrece automáticamente en todos los platos. Se suma al precio
              del producto.
            </p>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="disponible"
                defaultChecked={
                  adicionModal === "nueva" ? true : adicionModal.disponible
                }
              />
              <span>Disponible</span>
            </label>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
