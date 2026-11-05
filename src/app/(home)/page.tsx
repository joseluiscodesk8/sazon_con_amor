import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import {
  DESCRIPCION_SITIO,
  TITULO_INICIO,
  crearMetadata,
  esquemaRestaurante,
} from "@/lib/seo";
import styles from "./page.module.scss";

export const metadata: Metadata = crearMetadata({
  titulo: TITULO_INICIO,
  descripcion: DESCRIPCION_SITIO,
  ruta: "/",
});

export default function Home() {
  return (
    <main id="contenido" tabIndex={-1} className={styles.page}>
      <JsonLd datos={esquemaRestaurante()} />
      <div className={styles.glow} aria-hidden />

      <header className={styles.brand}>
        <span className={styles.logo}>Sazón</span>
        <span className={styles.logoAlt}>con Amor</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>Comida casera hecha con amor</p>
        <h1 className={styles.title}>¿Cómo quieres comer hoy?</h1>
        <p className={styles.subtitle}>
          Elige una opción y arma tu pedido. También puedes ver nuestro menú.
        </p>
      </section>

      <section className={styles.options}>
        <Link href="/menu/domicilio" className={styles.card}>
          <span className={styles.icon} aria-hidden>
            🛵
          </span>
          <h2>Pedir a domicilio</h2>
          <p>Te llevamos tu pedido hasta la puerta.</p>
          <span className={styles.cta}>Pedir ahora →</span>
        </Link>

        <Link href="/menu/restaurante" className={styles.card}>
          <span className={styles.icon} aria-hidden>
            🍽️
          </span>
          <h2>Comer en el restaurante</h2>
          <p>Pide desde tu mesa y nosotros lo llevamos.</p>
          <span className={styles.cta}>Ver menú →</span>
        </Link>
      </section>

      <footer className={styles.footer}>
        <span>Hecho con sazón y cariño 💛</span>
      </footer>
    </main>
  );
}
